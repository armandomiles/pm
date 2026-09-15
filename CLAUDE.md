# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management MVP: a Kanban board with drag-and-drop, single hardcoded-user login, SQLite persistence, and an AI chat sidebar (via OpenRouter) that can create/edit/move cards. NextJS frontend statically exported and served by a FastAPI backend, everything packaged into one Docker container. See `AGENTS.md` for full business requirements/decisions and `docs/PLAN.md` for the staged implementation history (all parts complete).

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

**Auth**: intentionally minimal and non-persistent. `backend/app/main.py` hardcodes `user`/`password`, stores active session tokens in an in-memory `set` (`active_sessions`), and gates routes via an `pm_session` httponly cookie checked by `require_session`. Restarting the backend logs everyone out. There is exactly one user (`DEFAULT_USER_ID = "user"`) for the MVP; do not build multi-user logic without checking `AGENTS.md`/`docs/PLAN.md` first.

**Board persistence**: the whole Kanban board (columns + cards) is stored as a single JSON blob per user in SQLite (`board_snapshots` table, one row for the MVP), not normalized into relational tables — see `docs/database-schema.md` for the rationale and shape. `backend/app/database.py` owns the Pydantic models (`Board`, `Column`, `Card`) that double as both the API schema and the persistence validation layer: `Board.validate_card_references` enforces that every card is referenced by exactly one column and that the `cards` map keys match card IDs. Any code that constructs a `Board` must satisfy this invariant or the model raises. DB path is `backend/data/project.db` by default, overridable via `PROJECT_DB_PATH` (used by tests to isolate state).

**AI chat**: `backend/app/ai.py` is a thin OpenRouter client (model `openai/gpt-oss-120b`, `OPENROUTER_API_KEY` from env, never sent to the client). `/api/ai/chat` in `main.py` builds a system prompt embedding the *current* board JSON, sends OpenRouter a JSON-schema-constrained request (`ChatResponse.model_json_schema`) so the model must return `{response, board?}`, then validates and — only if present — persists `board` via `save_board`. Conversation history is passed in from the frontend on every request and is never stored server-side (browser-session only, per `AGENTS.md`).

**Frontend structure**: `KanbanBoard.tsx` owns board state and drag-and-drop (via `@dnd-kit`), delegating pure card-movement logic to `src/lib/kanban.ts` so it stays independently testable. `ChatSidebar.tsx` and `LoginForm.tsx` are the other stateful components; `KanbanColumn`/`KanbanCard`/`KanbanCardPreview`/`NewCardForm` are presentational. The frontend's `BoardData` shape (in `src/lib/kanban.ts`) must stay in sync with the backend's `Board` Pydantic model — changes to one require updating the other plus `docs/database-schema.md`.

## Conventions (from `AGENTS.md`)

- Keep it simple: no over-engineering, no speculative abstraction, no unnecessary defensive programming.
- Identify root causes before fixing; don't guess.
- No emojis, anywhere.
- API routes stay under `/api` so they never collide with the static frontend root.
- Secrets stay in environment variables — never in source, commits, or the Docker image.
