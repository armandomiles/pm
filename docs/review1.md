# Code Review 1

Full-repo review of the Project Management MVP (backend, frontend, docs), performed independently of `docs/code_review.md`. That earlier review's four "high priority" findings are fixed and verified against the current source; this pass focuses on what's left, including two places where an earlier fix doesn't fully cover the underlying problem. Findings are ordered by severity, most severe first.

## 1. The AI chat's structured-output schema is still not strict-mode compliant, because `Board.cards` is a dictionary

**Files:** `backend/app/main.py:78-92` (`strict_json_schema`), `backend/app/database.py:27-29` (`Board.cards: dict[str, Card]`)

`docs/code_review.md` finding #3 was marked fixed by adding `strict_json_schema()`, which force-sets `required` and `additionalProperties: false` on every object schema that has a `"properties"` key. That fix is necessary but not sufficient. `Board.cards` is `dict[str, Card]` (a map keyed by card id), and Pydantic renders that as:

```json
"cards": { "type": "object", "additionalProperties": { "$ref": "#/$defs/Card" }, "title": "Cards" }
```

confirmed by generating the schema directly. This object has no `"properties"` key, so `strict_json_schema`'s guard (`schema.get("type") == "object" and "properties" in schema`) never touches it, and `additionalProperties` is left as an open-ended `$ref` rather than `false`. OpenAI-style strict structured outputs (which this code explicitly opts into via `"strict": True`) do not support free-form dictionaries/maps at all — every object must have a fixed, enumerable set of properties with `additionalProperties: false`. A schema containing a map like this is exactly the shape strict mode rejects.

**Failure scenario:** whenever the assistant tries to return a `board` (i.e. any request where the user asks it to create/edit/move a card — the headline feature), the request sent to OpenRouter contains this non-strict-compliant `cards` map nested under `$defs.Board`. If the serving model/provider enforces the same strict-schema rules OpenAI does, the request is rejected or the model cannot produce a schema-valid board, and the user sees a 502 "OpenRouter returned invalid structured output" (or the underlying request fails outright) every time they ask the assistant to change the board — the one thing `strict_json_schema` was added to make work.

**Fix:** either restructure `Board.cards` as a `list[Card]` (dropping the id-keyed map) for the wire schema used in structured outputs, or hand-write the `response_format` schema for `ai_chat` instead of deriving it from `Board.model_json_schema()`, converting the `cards` map into an array-of-objects shape that strict mode can represent.

## 2. Cards cannot be edited through the UI, despite that being a stated requirement and a "done" checklist item

**Files:** `AGENTS.md:9`, `docs/PLAN.md:171`, `frontend/src/components/KanbanCard.tsx`, `frontend/src/components/KanbanColumn.tsx`

`AGENTS.md`'s business requirements state: "The cards on the Kanban board can be moved with drag and drop, **and edited**." `docs/PLAN.md`'s Part 7 checklist (all boxes checked) separately lists "rename, add, remove, **edit**, and drag-and-drop actions" as five distinct, delivered mutation types. Looking at the actual components: `KanbanCard.tsx` renders `card.title`/`card.details` as static text with only a delete ("Remove") button; `NewCardForm.tsx` only creates new cards; `KanbanColumn.tsx` wires up rename (column title only), add, and delete. There is no code path anywhere in the frontend that lets a user edit an existing card's title or details — only the AI chat feature can do that (via `ai_chat`'s `board` response).

**Failure scenario:** a user creates a card with a typo or wants to update a card's details after creation; there is no button, no click-to-edit, no modal — the only ways to change a card's content are to delete and recreate it, or ask the AI assistant to do it. This directly contradicts the requirement in `AGENTS.md` and the Part 7 checklist's claim of being done.

**Fix:** add an edit affordance to `KanbanCard` (e.g. click-to-edit title/details, mirroring `NewCardForm`'s inline form pattern) that calls a new `onEditCard` handler through to `updateBoard`, or explicitly amend `AGENTS.md`/`docs/PLAN.md` if this was intentionally descoped in favor of AI-driven edits only.

## 3. Optimistic board saves can revert to a stale snapshot when PUT responses arrive out of order

**File:** `frontend/src/components/KanbanBoard.tsx:46-68` (`updateBoard`)

```ts
const updateBoard = (nextBoard: BoardData) => {
  const previousBoard = board;
  setBoard(nextBoard);
  ...
  fetch("/api/board", { method: "PUT", ... }).then((response) => {
    if (!response.ok) { setSaveError(...); setBoard(previousBoard); }
  }).catch(() => { setSaveError(...); setBoard(previousBoard); });
};
```

`previousBoard` is captured per call from the `board` value closed over at call time. Nothing prevents two `updateBoard` calls from being in flight simultaneously (e.g. typing several characters into a column-title `<input>` fires `onRename` → `updateBoard` on every keystroke with no debounce, or a drag followed quickly by an edit). If an *older* request's PUT resolves (or fails) after a *newer* request's PUT has already succeeded, the older call's failure handler reverts `board` all the way back to its own `previousBoard` — a snapshot that predates the newer, already-persisted change — even though the server still has the newer state. The UI now silently disagrees with the server, which is the exact failure mode `docs/PLAN.md`'s Part 7 success criterion ("Failed requests are visible to the user... and do not silently corrupt local state") and `docs/code_review.md` finding #2 were meant to close.

**Failure scenario:** user types a column title quickly ("Q" then "Qu" then "Que"...), each keystroke fires its own PUT. If the PUT for "Q" is slow (network jitter) and fails after the PUT for "Que" has already succeeded, `updateBoard`'s catch handler for the "Q" request reverts local state to the pre-"Q" board, discarding the now-server-persisted "Que" from the visible UI even though the backend still has it.

**Fix:** guard against out-of-order responses — e.g. tag each `updateBoard` call with an incrementing request id and only apply a revert if no newer request has since succeeded, or debounce/coalesce rapid `updateBoard` calls (at minimum for text-input-driven updates) so there's at most one in-flight PUT per logical edit.

## 4. The AI-chat concurrency guard is a one-off special case; the symmetric race (manual save landing after an AI save) is unprotected

**File:** `backend/app/main.py:141-148` (`update_board`) vs `backend/app/main.py:209-216` (`ai_chat`)

`ai_chat` was patched (per `docs/code_review.md` finding #4) to re-check the board immediately before persisting the AI's update, discarding it if a concurrent manual save landed in between. `update_board` (the plain `PUT /api/board` handler used for every drag/rename/add/delete) has no equivalent check — it unconditionally calls `save_board` with whatever body it received. This is a special case bolted onto one endpoint rather than a general concurrency mechanism (e.g. a version/`updated_at` check applied uniformly wherever `save_board` is called).

**Failure scenario:** a user asks the assistant to move a card. While the OpenRouter round trip is in flight, the user also drags a different card, which fires its own `PUT /api/board` built from the pre-AI-response board snapshot (since the frontend keeps its own local `board` state and only refreshes it if the AI response includes a `board`). If that manual PUT is slow and lands *after* the AI's board is saved, it overwrites the AI's change with a snapshot that doesn't include it — silently discarding the just-applied AI edit, the mirror image of the bug finding #4 in `docs/code_review.md` was written to prevent.

**Fix:** move the "re-load and compare before saving" check into `save_board`/`update_board` itself (or add a lightweight version/timestamp precondition shared by both write paths) instead of only guarding the `ai_chat` path.

## 5. A corrupted or hand-edited board snapshot still crashes the API with an unhandled 500

**File:** `backend/app/database.py:72-89` (`board_from_json`, `load_board`), `backend/app/main.py` (`get_board`, `update_board`, `ai_chat`)

This is `docs/code_review.md` finding #5, still open in the current source. `board_from_json` raises a plain `ValueError` when the stored JSON fails `Board` validation, and none of `get_board`, `update_board`, or `ai_chat` (all of which call `load_board`) catch it.

**Failure scenario:** the `board_snapshots` row for `user` becomes invalid (partial write, manual SQLite edit, a future schema change that doesn't match old rows) — every subsequent `GET /api/board` and `POST /api/ai/chat` call 500s with no recovery path short of manually fixing the row.

**Fix:** catch `ValueError` in `load_board` (or its callers) and fall back to the default board, or surface a clear 4xx/5xx with actionable detail.

## 6. `ChatMessage.role` is unconstrained and forwarded verbatim into the OpenRouter request

**File:** `backend/app/main.py:57-59` (`ChatMessage`), `backend/app/main.py:175-186` (`ai_chat`)

```python
class ChatMessage(BaseModel):
    role: str
    content: str
```

`payload.history` entries are spread directly into the `messages` list sent to OpenRouter (`*[message.model_dump() for message in payload.history]`) with no restriction on `role` (e.g. to `"user"`/`"assistant"`). A client can send a history entry with `role: "system"` (or any other value some providers special-case), which lands in the message list after the real system prompt.

**Failure scenario:** a crafted `history` payload injects a fake `system` message that competes with or overrides the real system prompt built from the current board JSON, potentially steering the assistant to ignore the board-mutation constraints described in that prompt. Low real-world severity given this is a single hardcoded local user, but it's an unvalidated input path directly into a prompt-construction routine.

**Fix:** restrict `ChatMessage.role` to a `Literal["user", "assistant"]` (or otherwise validate/strip disallowed roles before forwarding).

## 7. Sessions never expire

**File:** `backend/app/main.py:18` (`active_sessions: set[str]`), `backend/app/main.py:72-75` (`require_session`)

Still open from `docs/code_review.md` finding #7. A token issued at login stays valid until the process restarts — no TTL, no idle timeout, no upper bound on the set's size.

**Failure scenario:** low practical risk for a single local hardcoded user, but worth a documented boundary (or a TTL) before this app is ever exposed beyond a developer's own machine.

## 8. Redundant `initialize_database()` call on every board read/write

**File:** `backend/app/database.py:79-104` (`load_board`, `save_board`)

Still open from `docs/code_review.md` finding #9. Both functions call `initialize_database()` (opens a connection, runs `CREATE TABLE IF NOT EXISTS`) even though `app/main.py`'s `lifespan` hook already runs it once at startup. Every `GET`/`PUT /api/board` and `/api/ai/chat` call now opens two SQLite connections instead of one, for no benefit once the table is known to exist.

**Fix:** drop the `initialize_database()` calls from `load_board`/`save_board` and rely on the startup call in `lifespan`.

## 9. `KanbanCardPreview` duplicates `KanbanCard`'s markup

**Files:** `frontend/src/components/KanbanCardPreview.tsx`, `frontend/src/components/KanbanCard.tsx`

Still open from `docs/code_review.md` finding #10. The drag-overlay preview re-implements the same title/details JSX as the real card instead of sharing a small presentational sub-component (the only difference is the missing delete button and drag handlers).

**Failure scenario:** a future styling or content change to the card body (e.g. adding a tag, truncating long details, or the card-edit UI from finding #2 above) only lands in one of the two components unless the author remembers to update both, so the drag preview visually diverges from the real card.

## What's still solid

- Backend `Board` validation (`backend/app/database.py`) still correctly rejects duplicate card references, orphaned column references, and mismatched card-map keys, enforced on both API write and stored-snapshot read.
- Secrets handling remains clean: `.env` is gitignored, `OPENROUTER_API_KEY` is read only server-side, and `backend/data/` is now gitignored (verified: neither is tracked in git).
- `moveCard` in `frontend/src/lib/kanban.ts` correctly handles same-column reordering, cross-column moves, and dropping onto an empty column.
- The four high-priority findings in `docs/code_review.md` (test database isolation, failed-save revert, strict-schema `required`, and the `ai_chat`-vs-manual-save race) are genuinely fixed and covered by regression tests, though findings #1 and #4 above show the underlying problems (map schemas in strict mode; save-path concurrency) weren't fully closed by those fixes.
