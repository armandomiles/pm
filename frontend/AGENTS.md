# Frontend Guide

## Purpose

The `frontend/` directory contains the existing Next.js Kanban demo. It is currently a frontend-only application: board state is held in React memory and there is no authentication, backend API, database, or AI chat integration yet.

## Structure

- `src/app/page.tsx` is the root page and mounts `KanbanBoard`.
- `src/app/layout.tsx` provides the document shell and fonts.
- `src/app/globals.css` contains global styles and the project color variables.
- `src/components/KanbanBoard.tsx` owns the board state, drag-and-drop context, and board-level handlers.
- `src/components/KanbanColumn.tsx` renders a column, its sortable cards, rename input, and add-card form.
- `src/components/KanbanCard.tsx` renders a draggable card and its remove action.
- `src/components/KanbanCardPreview.tsx` renders the drag overlay card.
- `src/components/NewCardForm.tsx` owns the add-card form state and validation.
- `src/lib/kanban.ts` defines `Card`, `Column`, and `BoardData`, provides initial data, and contains pure card movement and ID helpers.
- `src/test/setup.ts` configures the Vitest test environment.
- `src/components/KanbanBoard.test.tsx` covers board rendering and basic user interactions.
- `src/lib/kanban.test.ts` covers pure card movement behavior.
- `tests/kanban.spec.ts` contains Playwright end-to-end coverage.

## Existing conventions

- TypeScript with strict checking and React function components.
- Next.js App Router. Components that use state or browser interaction include `"use client"` at the client boundary.
- Tailwind CSS utility classes are used for component styling, with shared color and surface variables in `globals.css`.
- `@/` is the configured source alias for imports from `src/`.
- `@dnd-kit` provides drag-and-drop behavior. Keep board movement logic in `src/lib/kanban.ts` where it can remain pure and testable.
- Use accessible labels and roles for interactive controls; the current tests query through Testing Library user-facing semantics.
- Keep components focused and avoid introducing state management libraries unless the application requirements make them necessary.

## Commands

Run these commands from `frontend/`:

- `npm run dev` starts the Next.js development server.
- `npm run build` creates the production build.
- `npm run start` serves the production build.
- `npm run lint` runs ESLint.
- `npm run test` runs Vitest once.
- `npm run test:unit:watch` runs Vitest in watch mode.
- `npm run test:e2e` runs Playwright tests.
- `npm run test:all` runs unit tests followed by Playwright tests.

## Development guidance

- Preserve the current board interactions while moving persistence or authentication into the planned backend layers.
- Keep board data compatible with the `BoardData` shape unless the data model is deliberately changed and documented in `docs/`.
- Add focused unit tests for pure logic and component behavior, plus Playwright coverage for user workflows.
- Keep authentication state in memory for the MVP and keep chat history in the current browser session only, as defined in `docs/PLAN.md`.
- Do not expose `OPENROUTER_API_KEY` or other backend secrets in client components, public assets, or static build output.