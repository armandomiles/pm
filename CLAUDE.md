# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management app: multi-user accounts, multiple Kanban boards per user (ownable and shareable), drag-and-drop cards with due dates/priority/assignee, search/filter, and an AI chat sidebar (via OpenRouter) that can create/edit/move cards on the current board. Started as an MVP (single hardcoded login, one board) and was expanded, per explicit user direction, into the current feature set. NextJS frontend statically exported and served by a FastAPI backend, everything packaged into one Docker container. See `AGENTS.md` for full business requirements/decisions and `docs/PLAN.md` for the staged implementation history — Parts 1-10 are the original MVP, Parts 11+ are the post-MVP expansion (multi-user, multi-board, sharing, card metadata, search/filter, account settings, optimistic concurrency).

## Commands

### Frontend (run from `frontend/`)

- `npm run dev` — Next.js dev server
- `npm run build` — production build (static export, see `next.config.ts`)
- `npm run lint` — ESLint
- `npm run test:unit` — Vitest once; `npm run test:unit:watch` for watch mode
- `npm run test:e2e` — Playwright (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if the machine's Chromium binary lives in a nonstandard cache)
- `npm run test:all` — unit tests then Playwright
- Single test file: `npx vitest run src/components/KanbanBoard.test.tsx`; single Playwright spec: `npx playwright test tests/kanban.spec.ts`

### Backend (run from `backend/`, requires `uv`)

- `uv run pytest tests` — run all backend tests
- `uv run pytest tests/test_board.py::test_name` — run a single test
- `uv run uvicorn app.main:app --reload --port 8000` — run the API locally
- If `uv` isn't installed on the host, run tests through the built image: `docker run --rm -v "${PWD}/backend:/app/backend" -w /app/backend pm-app uv run --project . --with pytest --with httpx python -m pytest tests`

### Full stack (Docker, from repo root)

- Start: `./scripts/start.ps1` / `scripts\start.bat` / `./scripts/start.sh` — builds and runs via `docker-compose.yml`, serves everything at `http://localhost:8000`
- Stop: matching `scripts/stop.*`
- Requires a root `.env` with `OPENROUTER_API_KEY=...` (never committed, never exposed to the frontend build)

## Architecture

**Build/serve pipeline**: `Dockerfile` is a two-stage build — stage 1 builds the Next.js app and produces a static export (`frontend/out`), stage 2 copies that export into `backend/static` and runs the FastAPI app under `uv`/uvicorn. FastAPI serves the API under `/api/*` and mounts the static frontend at `/`. There is no separate frontend server in production; `frontend/README.md`'s `npm run dev` is for local iteration only.

**Auth**: real per-user accounts, still deliberately simple. `backend/app/database.py`'s `users` table stores `id` (= username), `username`, and a `scrypt`-hashed password (`backend/app/security.py`, stdlib `hashlib.scrypt`, no third-party hashing dependency). Sessions stay in-memory only — `active_sessions: dict[str, str]` maps session token to user id, gated via a `pm_session` httponly cookie checked by `require_session`. Restarting the backend logs everyone out, by design. On a truly fresh database (the `users` table doesn't exist yet — not merely "zero users currently"), the original hardcoded `user`/`password` credential is auto-seeded with a sample board, so old setups and most tests keep working unchanged; see `docs/PLAN.md` Part 14 for why the seeding check is keyed off table existence rather than row count. `PUT /api/auth/password` and `DELETE /api/auth/account` (Part 14) round out account management.

**Board persistence and sharing**: a user can own multiple boards (`boards` table: `id`, `owner_id`, `name`, `board_json`, timestamps — each board's columns+cards stored as one JSON blob, not normalized, matching the original MVP decision; see `docs/database-schema.md`). A `board_members` table (`board_id`, `user_id`) lets an owner share a board with other users; any member can fully view/edit/rename a board, only the owner can delete it or manage membership — enforced by `_board_access()` in `backend/app/database.py`, the single source of truth for "can this user touch this board," not a strict `owner_id` match. `backend/app/database.py` owns the Pydantic models (`Board`, `Column`, `Card`) that double as both the API schema and the persistence validation layer: `Board.validate_card_references` enforces that every card is referenced by exactly one column and that the `cards` map keys match card IDs. Any code that constructs a `Board` must satisfy this invariant or the model raises. `Card` also carries optional `due_date`, `priority`, and `assignee` (Parts 12/16); `assignee`, when set, is validated server-side against the board's current owner+members inside `save_board_content` (Part 18). Manual (`PUT /api/boards/{id}`) and AI-driven (`/api/ai/chat`) saves both guard against overwriting a concurrent change: the AI path compares board content before/after the OpenRouter round-trip, the manual path uses a standard `If-Unmodified-Since` request header checked against an `X-Board-Updated-At` response header (Part 17) — a `412` means the client's copy is stale. DB path is `backend/data/project.db` by default, overridable via `PROJECT_DB_PATH` (used by tests to isolate state; the per-call `initialize_database()` guard is load-bearing for this, not just a redundant safety net, since tests set the env var after the FastAPI app object already exists).

**AI chat**: `backend/app/ai.py` is a thin OpenRouter client (model `openai/gpt-oss-120b`, `OPENROUTER_API_KEY` from env, never sent to the client). `/api/ai/chat` takes a `board_id` and is scoped to that specific board. `main.py` builds a system prompt embedding the *current* board JSON, sends OpenRouter a JSON-schema-constrained request (`ChatResponse.model_json_schema`) so the model must return `{response, board?}`, then validates and — only if present and if `save_board_content` actually reports `"saved"` (not stale, not an invalid assignee) — persists `board` and returns it; otherwise the board update is discarded from the response so the client never believes an unpersisted change applied. Conversation history is passed in from the frontend on every request and is never stored server-side (browser-session only, per `AGENTS.md`).

**Frontend structure**: `page.tsx` is a small state machine (logged out → board list → a specific board) holding the current username. `BoardList.tsx` lists/creates/renames/deletes boards and hosts `AccountSettings.tsx` (change password / delete account) and `ShareBoardPanel.tsx` (invite/remove members) as togglable panels. `KanbanBoard.tsx` owns board state, drag-and-drop (via `@dnd-kit`), card-filter state, and fetches the board's member list; it delegates pure card-movement and filter-matching logic to `src/lib/kanban.ts` so both stay independently testable. `ChatSidebar.tsx` and `LoginForm.tsx` (now signup-capable) are the other stateful components; `KanbanColumn`/`KanbanCard`/`KanbanCardPreview`/`NewCardForm`/`CardMeta`/`BoardFilterBar` are presentational. `members` (board access list) is threaded down as an optional prop through this whole tree so local/demo-mode rendering (no `boardId`, used by several unit tests) is unaffected. The frontend's `BoardData`/`Card` shape (in `src/lib/kanban.ts`) must stay in sync with the backend's `Board`/`Card` Pydantic models — changes to one require updating the other plus `docs/database-schema.md`.

## Conventions (from `AGENTS.md`)

- Keep it simple: no over-engineering, no speculative abstraction, no unnecessary defensive programming.
- Identify root causes before fixing; don't guess.
- No emojis, anywhere.
- API routes stay under `/api` so they never collide with the static frontend root.
- Secrets stay in environment variables — never in source, commits, or the Docker image.
