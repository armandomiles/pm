# Code Review

Full-repo review of the Project Management MVP (backend, frontend, Docker/scripts, docs). Findings are ordered by priority. Each includes the concrete evidence and a suggested fix.

## High priority

All four issues below are **fixed** as of this update.

### 1. Backend tests are not isolated from the real database, and it gets committed to git — FIXED

**Files:** `backend/tests/test_board.py:12-14`, `backend/tests/test_chat.py`, `backend/tests/test_ai.py`, `backend/tests/test_auth.py`, `backend/data/project.db`

There is no `conftest.py` and no shared fixture that redirects `PROJECT_DB_PATH` to a temporary file for the whole test suite. Isolation is done ad hoc, per test:

- `test_board.py`'s `setup_function` runs before every test in that file and unconditionally does `database_path().unlink(missing_ok=True)`. Because `monkeypatch` env changes from a previous test are already rolled back by the time the *next* test's `setup_function` runs, this deletes whatever is at the **default** path — `backend/data/project.db` — not a temp file, for the first test in the file and between un-isolated tests.
- `test_ai.py`, `test_auth.py`, and `test_chat.py` never set `PROJECT_DB_PATH` at all, so anything they persist (e.g. `test_chat_persists_valid_board_update`) writes straight into the real default `backend/data/project.db`.

We verified this empirically in this session: running `pytest tests` (as documented in `docs/local-development.md`) left `backend/data/project.db` modified in `git status` immediately afterward.

**Failure scenario:** a developer runs the container locally (`scripts/start.*`, which bind-mounts `backend/data`), builds up real board state, then runs the documented test command from `docs/local-development.md` — the suite silently deletes/overwrites that same file. Because the file is also tracked in git, this repeatedly dirties the working tree and risks a corrupted or unintended snapshot being committed by accident.

**Fix:**
- Add `backend/tests/conftest.py` with an autouse fixture that does `monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "test.db"))` for every test, and delete the manual per-test monkeypatching and the destructive `unlink()` call.
- Run `git rm --cached backend/data/project.db` and add `backend/data/` (or `*.db`) to `.gitignore` — this file is generated on first run (`initialize_database()`), not source, and shouldn't be version-controlled.

**Applied:** added `backend/tests/conftest.py` with an autouse `isolated_database` fixture; removed the destructive `unlink()` from `test_board.py`'s `setup_function`; added `backend/data/` to `.gitignore` and untracked `backend/data/project.db` with `git rm --cached`. Verified the full backend suite (14 tests) now leaves the real db file untouched.

### 2. Failed board saves silently diverge from the server without recovery — FIXED

**File:** `frontend/src/components/KanbanBoard.tsx:46-63`

```ts
const updateBoard = (nextBoard: BoardData) => {
  setBoard(nextBoard);            // optimistic update, applied unconditionally
  ...
  fetch("/api/board", { method: "PUT", ... }).then((response) => {
    if (!response.ok) setSaveError("Unable to save the board.");
  }).catch(() => setSaveError("Unable to save the board."));
};
```

**Failure scenario:** the PUT fails (network blip, backend restart, validation error). The user sees the red "Unable to save the board." banner, but `board` in React state is never reverted and the server is never re-queried — the visibly-rendered board keeps the unsaved change indefinitely, including across further edits, until the next full page reload. This is a real (if narrow) violation of the Part 7 success criterion in `docs/PLAN.md`: *"Failed requests are visible to the user... and do not silently corrupt local state."* The error is shown, but the state does silently drift from what's persisted.

**Fix:** on a failed save, either revert `board` to the last known-good value (keep a ref/previous copy) or re-fetch `/api/board` and overwrite local state with the server's version.

**Applied:** `updateBoard` now captures `previousBoard` before the optimistic update and reverts to it in both the `!response.ok` and `.catch` branches. Added a regression test (`KanbanBoard.test.tsx`: "reverts the optimistic update and shows an error when saving fails").

### 3. The AI chat's structured-output schema likely fails OpenRouter's strict-mode validation — FIXED

**File:** `backend/app/main.py:170-177`, `backend/app/main.py` (`ChatResponse.board: Board | None = None`)

The request sets `"strict": True` and hands OpenRouter `ChatResponse.model_json_schema(by_alias=True)` directly. We generated that schema and confirmed it emits `"required": ["response"]` — the optional `board` field is left out of `required` entirely (Pydantic represents it as `"anyOf": [{"$ref": "#/$defs/Board"}, {"type": "null"}], "default": null`, not present in `required`). OpenAI-style strict structured outputs require *every* property to be listed in `required`, with optionality expressed via a nullable type instead — a schema that omits an optional field from `required` is normally rejected by the provider before the model even runs.

**Failure scenario:** every real call to `/api/ai/chat` sent to OpenRouter with `strict: True` is at risk of being rejected at the schema-validation stage, surfacing to the user as a generic 502 "OpenRouter returned invalid structured output" or an upstream error — i.e. the headline AI chat feature may not work at all against the real API. This is untested because `test_chat.py` mocks `openrouter_chat` entirely (see finding #1's sibling problem — no test ever validates the schema against a real or schema-validating fake provider), so CI/local tests give no signal here.

**Fix:** add `"board"` to the schema's top-level `required` list before sending it (e.g. `schema["required"] = list(schema["properties"])`), or hand-write the `response_format` schema instead of deriving it directly from `model_json_schema()`.

**Applied:** added a `strict_json_schema()` helper in `main.py` that recursively sets `required` to every property and `additionalProperties: false` on every object schema (including nested `$defs` like `Board`/`Card`/`Column`), covering the full strict-mode contract rather than just the top-level `board` field. Added `test_strict_json_schema_marks_every_property_required`, which asserts this against the real generated schema.

### 4. AI chat can silently overwrite concurrent manual board edits — FIXED

**File:** `backend/app/main.py:151-194` (`ai_chat`)

`ai_chat` loads the board once at the start of the request (`board = load_board(...)`, line 157) to build the prompt, and — only if the OpenRouter round trip returns a `board` — persists that model-derived board unconditionally at the end (`save_board(DEFAULT_USER_ID, chat_response.board)`, line 193). There is no version check between the snapshot the prompt was built from and what's in the database when the response comes back.

**Failure scenario:** a user drags a card (which saves immediately via `PUT /api/board`) while a chat request is still in flight from a few seconds earlier. When the chat response returns, its `board` was derived from the pre-drag snapshot and gets saved as-is, silently reverting the drag with no conflict warning to either the chat UI or the board UI.

**Fix:** at minimum, re-load the board immediately before saving the AI's update and reject/merge if it no longer matches the snapshot the prompt was built from; a stronger fix would apply the AI's board as a diff against the *current* board rather than as a full replacement.

**Applied:** `ai_chat` now re-loads the board right before persisting and compares it to the snapshot the prompt was built from; if they differ, the AI's board update is discarded (`chat_response.board` set to `None` in the response) instead of overwriting the newer save. Added `test_chat_discards_board_update_that_raced_a_concurrent_save`, which simulates a manual `PUT /api/board` landing mid-request and asserts the concurrent edit wins.

## Medium priority

### 5. Corrupted or hand-edited board snapshots crash the API with an unhandled 500

**File:** `backend/app/database.py:72-89`, `backend/app/main.py` (`get_board`, `update_board`, `ai_chat`)

`board_from_json` raises a plain `ValueError` when a stored snapshot fails `Board` validation, and `load_board` does not catch it. None of the three routes that call `load_board` (`get_board`, `ai_chat`, and indirectly via the default-board bootstrap) wrap it in a `try/except`, so a bad row becomes an unhandled FastAPI 500 instead of a clean error.

**Failure scenario:** if the `board_snapshots` row for `user` is ever hand-edited, partially written, or drifts from the current `Board` schema (all made more likely by finding #1's habit of the real file being touched by tests), every subsequent `GET /api/board` and `/api/ai/chat` call 500s with no recovery path short of manually fixing the SQLite row.

**Fix:** catch the `ValueError` from `load_board` in the routes (or inside `load_board` itself) and either fall back to the default board or return a clear 500/409 with actionable detail instead of an opaque unhandled exception.

### 6. The e2e suite never runs against the real backend

**Files:** `frontend/tests/kanban.spec.ts`, `frontend/playwright.config.ts`

Every test calls `mockApi(page)`, which intercepts `**/api/auth/me`, `/login`, `/logout`, and `/board` via `page.route(...)` and fabricates responses. The suite also runs against `next dev` on port 3000 (Playwright's own `webServer`), not the static export served by FastAPI at `/`. So there is currently no automated test that drives a real browser against the actual authenticated flow, the real SQLite persistence, or the production static-export build — that path was only verified manually in this session (`docker compose up` + `curl`).

**Fix:** consider one Playwright project/test that points `baseURL` at a running `docker compose` instance and exercises login → board load → save round trip without route mocking, to catch integration regressions the mocked suite can't.

### 7. Sessions never expire

**File:** `backend/app/main.py:18,72-75`

`active_sessions: set[str]` has no TTL or size bound — a token issued at login remains valid until the process restarts. Given the MVP has exactly one hardcoded user behind a login screen, the practical risk is low, but this is worth flagging explicitly if the app is ever exposed beyond a local machine, since `docs/database-schema.md` / `AGENTS.md` treat this as an intentional MVP limitation rather than a documented security boundary.

### 8. Coverage gap: failed-save UI path is untested

**File:** `frontend/src/components/KanbanBoard.test.tsx`

There's a test for the success path (`"loads and saves the board through the API"`), but no test asserts the `saveError` banner renders when the PUT fails — which is exactly the path with the bug in finding #2. Adding that test would have caught it.

## Low priority / polish

### 9. Redundant database initialization on every request

**File:** `backend/app/database.py:79-104`

Both `load_board` and `save_board` call `initialize_database()` themselves (which opens its own connection and runs `CREATE TABLE IF NOT EXISTS`), even though `app/main.py`'s `lifespan` hook already calls it once at startup. Every `GET`/`PUT /api/board` and `/api/ai/chat` call now opens two SQLite connections instead of one for no benefit, since the table is guaranteed to exist after startup.

**Fix:** drop the `initialize_database()` calls from `load_board`/`save_board` and rely on the one done in `lifespan`.

### 10. `KanbanCardPreview` duplicates `KanbanCard`'s markup

**Files:** `frontend/src/components/KanbanCardPreview.tsx`, `frontend/src/components/KanbanCard.tsx`

The drag-overlay preview re-implements the same title/details JSX as the real card instead of sharing a small presentational sub-component (the only difference is the missing delete button and drag handlers).

**Failure scenario:** a future styling or content change to the card body (e.g. adding a tag, truncating long details) only lands in one of the two components unless the author remembers to update both, so the drag preview visually diverges from the real card.

### 11. Container runs as root

**File:** `Dockerfile`

No `USER` directive — the `uvicorn` process runs as root inside the container. Reasonable for a local-only MVP; worth a non-root user if this ever runs anywhere less trusted than a developer's machine.

### 12. No CI

There's no `.github/workflows` (or other CI config) running the documented `lint` / `test:unit` / `test:e2e` / backend `pytest` commands automatically. Right now the full check matrix in `docs/local-development.md` is only run by hand.

### 13. Client-generated IDs use `Math.random()`

**File:** `frontend/src/lib/kanban.ts:164-168`

`createId` combines `Math.random()` and `Date.now()`, which is fine for this single-user MVP but is a theoretical collision risk under rapid concurrent card creation. Not worth changing unless multi-user support is added.

## What's solid

- Backend `Board` validation (`backend/app/database.py`) correctly rejects duplicate card references, orphaned column references, and mismatched card-map keys — this is enforced both on API write (422) and on stored-snapshot read.
- Secrets handling is clean: `.env` is gitignored at the root, `OPENROUTER_API_KEY` is read only server-side, and it's absent from the static frontend bundle (confirmed via `.dockerignore` and the two-stage `Dockerfile`).
- Auth, board persistence, and AI-chat backend routes all have passing, focused tests for both the happy path and the relevant failure modes (missing auth, invalid structured output, invalid board references).
- `moveCard` in `frontend/src/lib/kanban.ts` correctly handles same-column reordering, cross-column moves, and dropping onto an empty column, and is well covered by `kanban.test.ts`.
