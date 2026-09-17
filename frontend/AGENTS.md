# Frontend Guide

## Purpose

The `frontend/` directory is the Next.js client for the Project Management app: authentication (login/signup), a board list, Kanban boards with drag-and-drop, board sharing, and an AI chat sidebar, talking to the FastAPI backend under `/api/*`. Statically exported and served by the backend in production (see root `CLAUDE.md`); `npm run dev` is for local iteration only and does not proxy `/api/*` anywhere.

## Structure

- `src/app/page.tsx` is the root page: a small state machine (logged out → board list → a specific board) that also holds the current username.
- `src/app/layout.tsx` provides the document shell and fonts; `src/app/globals.css` holds global styles and the project color variables.
- `src/components/LoginForm.tsx` handles both sign-in and signup.
- `src/components/BoardList.tsx` lists/creates/renames/deletes the user's boards (owned and shared) and hosts `AccountSettings.tsx` and `ShareBoardPanel.tsx` as togglable panels.
- `src/components/AccountSettings.tsx` — change password / delete account.
- `src/components/ShareBoardPanel.tsx` — list/invite/remove a board's members (owner only).
- `src/components/KanbanBoard.tsx` owns board state, drag-and-drop context, card-filter state, and fetches the board's member list.
- `src/components/BoardFilterBar.tsx` — search/priority/overdue/assignee filter controls.
- `src/components/KanbanColumn.tsx` renders a column, its sortable cards, rename input, and add-card form.
- `src/components/KanbanCard.tsx` renders a draggable card, its inline edit form, and delete action.
- `src/components/CardMeta.tsx` renders a card's priority/due-date/assignee badges (shared between `KanbanCard` and `KanbanCardPreview`).
- `src/components/KanbanCardPreview.tsx` renders the drag overlay card.
- `src/components/NewCardForm.tsx` owns the add-card form state and validation.
- `src/components/ChatSidebar.tsx` — the AI chat sidebar, scoped to the open board.
- `src/components/icons.tsx` — small inline SVG icons (no icon library dependency).
- `src/lib/kanban.ts` defines `Card`, `Column`, `BoardData`, and `CardFilter`; provides initial demo data; contains pure card-movement, filter-matching, and due-date helpers.
- `src/test/setup.ts` configures the Vitest test environment.
- `*.test.tsx` next to each component covers its rendering and interactions; `src/lib/kanban.test.ts` covers pure logic.
- `tests/kanban.spec.ts` contains Playwright end-to-end coverage.

## Existing conventions

- TypeScript with strict checking and React function components.
- Next.js App Router. Components that use state or browser interaction include `"use client"` at the client boundary.
- Tailwind CSS utility classes are used for component styling, with shared color and surface variables in `globals.css`.
- `@/` is the configured source alias for imports from `src/`.
- `@dnd-kit` provides drag-and-drop behavior. Keep board movement and filter logic in `src/lib/kanban.ts` where it can remain pure and testable.
- Use accessible labels and roles for interactive controls; tests query through Testing Library/Playwright user-facing semantics (`getByLabel`, `getByRole`, etc.), not test IDs, except for `data-testid` on cards/columns where multiple identical-looking elements need disambiguation.
- Components that only make sense with board members (assignee pickers, filters) accept `members` as an optional prop defaulting to `[]`, so local/demo rendering without a `boardId` (used by several unit tests) stays unaffected.
- Keep components focused and avoid introducing state management libraries unless the application requirements make them necessary.

## Commands

Run these commands from `frontend/`:

- `npm run dev` starts the Next.js development server.
- `npm run build` creates the production build (static export).
- `npm run start` serves the production build.
- `npm run lint` runs ESLint.
- `npm run test:unit` runs Vitest once; `npm run test:unit:watch` for watch mode.
- `npm run test:e2e` runs Playwright tests.
- `npm run test:all` runs unit tests followed by Playwright tests.

## Development guidance

- Keep board data compatible with the `BoardData`/`Card` shape unless the data model is deliberately changed and documented in `docs/database-schema.md` (and the matching backend Pydantic models updated in lockstep).
- Add focused unit tests for pure logic and component behavior, plus Playwright coverage for user workflows.
- Keep authentication state in memory (backend) and chat history in the current browser session only, per `docs/PLAN.md`.
- Do not expose `OPENROUTER_API_KEY` or other backend secrets in client components, public assets, or static build output.
