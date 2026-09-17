# Project Management MVP Plan

## Decisions and working rules

- The MVP has one hardcoded login: `user` / `password`.
- Authentication is held in application memory only. It is not persisted in SQLite.
- Conversation history is held in the current browser session only. It is not persisted in SQLite.
- SQLite stores Kanban board snapshots as JSON. The initial schema should keep the board payload intact rather than normalize cards and columns into separate tables.
- The backend serves the statically exported Next.js application at `/` and exposes the API beneath `/api`.
- OpenRouter calls use `openai/gpt-oss-120b` and read `OPENROUTER_API_KEY` from the project-root `.env` file.
- Keep the implementation small and aligned with the existing frontend. Complete each part and its validation before moving to the next part.
- Parts that change the data model or user-visible behavior require user approval at the gate described below.

## Part 1: Plan and frontend documentation

### Checklist

- [x] Expand this plan into staged implementation work, tests, and success criteria.
- [x] Record the decisions about JSON snapshots, in-memory authentication, and browser-session chat history.
- [x] Create `frontend/AGENTS.md` describing the existing frontend structure, commands, and conventions.
- [x] Get user approval for this plan before implementing application changes.

### Tests and checks

- Confirm the plan covers every requested part and identifies a validation step for each.
- Confirm `frontend/AGENTS.md` matches the current source tree and package scripts.

### Success criteria

- The user approves the staged plan and any open implementation questions are resolved.

### Approval gate

- Stop after Part 1 until the user explicitly approves the plan.

## Part 2: Scaffolding

### Checklist

- [x] Add the Dockerfile and supporting Docker configuration for the FastAPI backend and static frontend.
- [x] Add the minimal FastAPI application and a health or example API route.
- [x] Add a minimal static HTML response or frontend build output for the initial container smoke test.
- [x] Add start and stop scripts for Windows, macOS, and Linux in `scripts/`.
- [x] Use `uv` for Python dependency and environment management in the container.
- [x] Document required environment variables and local startup commands.

### Tests and checks

- Build the Docker image successfully.
- Start the container using the platform-appropriate script.
- Request `/` and verify a hello-world response.
- Call the example API route and verify its response.
- Stop the container and verify it exits cleanly.

### Success criteria

- A fresh checkout can build and start locally with the documented command.
- The container serves `/` and responds to the example API call.
- No application secret is copied into the image.

Part 2 implementation is complete; the environment-variable and startup documentation will be finalized with the complete application workflow.

## Part 3: Serve the existing frontend

### Checklist

- [x] Configure Next.js for a static export compatible with FastAPI static serving.
- [x] Copy or mount the generated frontend output into the backend image.
- [x] Replace the hello-world root response with the exported Kanban application.
- [x] Preserve the existing board interactions: rename columns, add cards, remove cards, and drag cards.
- [x] Keep API fallback behavior clear while the app is still frontend-only.

### Tests and checks

- Run frontend unit tests, lint, and production build.
- Run the existing Playwright test against the served application.
- Build and start the container, then verify `/` renders the board and the example API remains reachable.

### Success criteria

- The demo Kanban board loads from the FastAPI-served static site at `/`.
- Existing board behavior works in a production build, not only in the Next.js dev server.
- Frontend and container checks pass.

## Part 4: Fake user sign-in

### Checklist

- [x] Add a login screen shown before the board.
- [x] Accept only `user` / `password` for the MVP.
- [x] Keep authentication state in memory and expose the smallest necessary backend/session contract.
- [x] Protect the board route and API behavior for signed-out users.
- [x] Add logout and return the user to the login screen.
- [x] Do not persist credentials, sessions, or authentication state in SQLite.

### Tests and checks

- [x] Test the login form for invalid and valid credentials.
- [x] Test that a signed-out user cannot see or use the board.
- [x] Test logout and the resulting protected state.
- Exercise the flow through Playwright on the production-served app.

### Success criteria

- The board is visible only after a successful MVP login.
- Refresh and logout behavior match the documented in-memory session behavior.
- The hardcoded credential is not duplicated across unrelated components.

### Approval gate

- [x] Confirm the authentication behavior and its intentionally non-persistent limitation before continuing.

## Part 5: Database modeling

### Checklist

- [x] Define the JSON board snapshot shape based on the existing `BoardData` model.
- [x] Define the SQLite metadata needed to identify a user and board snapshot without normalizing cards and columns.
- [x] Define snapshot creation, replacement, and retrieval semantics.
- [x] Define initialization behavior when the database file or required table does not exist.
- [x] Document the schema, migration expectations, and limitations in `docs/`.
- [x] Get user sign-off on the proposed schema before implementing routes.

### Tests and checks

- Validate representative board snapshots against the agreed shape.
- Test database creation in an empty temporary directory.
- Test saving and loading a complete JSON snapshot without data loss.
- Test behavior for a missing user snapshot.

### Success criteria

- The schema is documented and approved.
- Board columns, card order, and card content survive a save/load round trip.
- The database can be initialized safely from a clean checkout.

### Approval gate

- Stop until the user approves the database schema and JSON snapshot approach.

## Part 6: Backend Kanban API

### Checklist

- [x] Add authenticated routes to read the current user's board snapshot.
- [x] Add authenticated routes to replace or update the current user's board snapshot.
- [x] Validate request and response payloads with FastAPI models.
- [x] Create the SQLite database automatically if it does not exist.
- [x] Return clear responses for unauthenticated requests, invalid boards, and missing data.
- [x] Keep user identity scoped to the in-memory MVP authentication layer.

### Tests and checks

- [x] Unit-test database initialization and snapshot persistence.
- [x] Unit-test authentication and authorization for every route.
- [x] Test valid reads and writes, malformed JSON structures, and missing snapshots.
- [x] Test route behavior with an isolated temporary SQLite database.
- [x] Run the backend test suite and API integration tests.

### Success criteria

- An authenticated user can read and change their own board through the API.
- Invalid or unauthenticated requests cannot alter board data.
- Data persists across backend restarts while authentication remains memory-only.

## Part 7: Frontend and backend integration

### Checklist

- [x] Replace local initial board state with an API load after authentication.
- [x] Send board changes for rename, add, remove, edit, and drag-and-drop actions.
- [x] Add loading, saving, and error states without losing the current board unnecessarily.
- [x] Refresh the board after successful server responses where needed.
- [x] Ensure the static build uses the correct relative or configured API base URL.

### Tests and checks

- [x] Mock API success and failure in frontend tests.
- [x] Test each board mutation produces the expected API payload.
- [x] Test loading and error states.
- [x] Run backend API tests plus frontend unit, lint, build, and Playwright tests.
- [x] Restart the container and verify the saved board is still present.

### Success criteria

- The UI displays and updates the board through the backend API.
- Board changes survive a page reload and backend restart.
- Failed requests are visible to the user and do not silently corrupt local state.

## Part 8: OpenRouter connectivity

### Checklist

- [x] Add a small backend OpenRouter client using the configured model.
- [x] Read `OPENROUTER_API_KEY` from the environment without exposing it to the frontend.
- [x] Add a minimal backend test or diagnostic route for a `2+2` request.
- [x] Add timeout and concise error handling for unavailable or invalid upstream responses.
- [x] Document how to configure the key locally without committing it.

### Tests and checks

- [x] Test client request construction with a mocked OpenRouter response.
- [x] Test missing-key and upstream-error behavior without making real network calls.
- [x] Run the opt-in live `2+2` connectivity check when a key is available.

### Success criteria

- The backend can make a successful authenticated OpenRouter request using the required model.
- The API key never appears in browser code or committed files.
- Local tests remain deterministic without network access.

## Part 9: Structured AI board operations

### Checklist

- [x] Define the chat request containing the user's question, current board JSON, and browser-session conversation history.
- [x] Define the structured response containing the assistant message and an optional board update.
- [x] Configure OpenRouter structured outputs for that response shape.
- [x] Validate any returned board update before saving it.
- [x] Apply an accepted board update atomically through the backend persistence path.
- [x] Keep conversation history out of SQLite and outside server-side long-term storage.

### Tests and checks

- [x] Test prompt construction with board JSON, question, and ordered history.
- [x] Test valid responses with and without board updates.
- [x] Test malformed structured output and invalid board updates.
- [x] Test that rejected updates do not change the stored board.
- [x] Test upstream timeout, refusal, and API errors.

### Success criteria

- Every AI request receives the current board JSON and relevant browser-session history.
- The backend returns a predictable structured response.
- Only validated optional board updates are persisted.

### Approval gate

- [x] Confirm the structured response shape and update permissions before building the full chat UI.

## Part 10: AI chat sidebar

### Checklist

- [x] Add a responsive sidebar chat widget to the authenticated board view.
- [x] Support sending messages and rendering assistant responses and request states.
- [x] Maintain conversation history for the current browser session only.
- [x] Send the current board with each request through the backend contract.
- [x] Refresh the board automatically when the AI returns an accepted update.
- [x] Handle empty input, loading, API errors, and mobile layout cleanly.
- [x] Match the existing color scheme and frontend component conventions.

### Tests and checks

- [x] Test sending a message and rendering a structured assistant response.
- [x] Test browser-session history ordering and reset behavior.
- [x] Test an AI-created board update refreshes the visible board.
- [x] Test no-update responses leave the board unchanged.
- [x] Test loading and error states in unit tests and the complete flow in Playwright.
- [x] Run frontend lint, unit tests, production build, backend tests, and container smoke tests.

### Success criteria

- A signed-in user can chat with the AI beside the board.
- The AI can create, edit, and move cards only through validated structured updates.
- Accepted AI changes appear in the board without a manual reload.
- Conversation history disappears when the browser session ends and is never stored in SQLite.

## Overall completion criteria (original MVP scope)

- The documented Docker workflow starts the complete application locally.
- Authentication, Kanban persistence, and AI updates work together for the MVP user.
- Automated frontend and backend tests cover the principal success and failure paths.
- Secrets remain in environment configuration and are not bundled into the static frontend.
- The README and working documentation describe the commands, limitations, and approval decisions accurately.

---

## Post-MVP expansion

The original MVP scope above is complete. `AGENTS.md`'s "Limitations" section explicitly anticipated growing past a single hardcoded user ("the database will support multiple users for future"). The parts below track that expansion into a comprehensive project-management app, run as an autonomous Ralph-loop task. Since there is no human approval checkpoint mid-loop, each part is scoped to a complete, independently-tested vertical slice, and decisions are recorded here (rather than gated) so later iterations — and a human reviewing afterward — can see what changed and why.

## Part 11: Real user accounts and multiple boards per user

### Decisions

- Replaced the single hardcoded `user`/`password` credential with real accounts: `users` table (scrypt-hashed passwords, stdlib `hashlib.scrypt` — no new dependency), signup + login against it. The original credential is auto-seeded on a fresh database so existing setups and docs keep working.
- Replaced the one-board-per-user `board_snapshots` table with a `boards` table (`id`, `owner_id`, `name`, `board_json`, timestamps) — a user can now own several boards. The board JSON shape itself (`columns`/`cards`) is unchanged, so the frontend's `BoardData` type didn't need to change, only how it's addressed (`/api/boards/{id}` instead of a single `/api/board`).
- Sessions stay in-memory (`token -> user_id`), same non-persistent design as before, now supporting more than one user id.
- Added a board list/dashboard screen (shown after login, before the Kanban board) to create, rename, delete, and switch between boards. See `docs/database-schema.md` for the full schema and API shape.
- AI chat now takes a `board_id` in the request and operates on that specific board.

### Checklist

- [x] `users` table + password hashing (`backend/app/security.py`) + signup/login routes.
- [x] `boards` table replacing `board_snapshots`; CRUD routes (`/api/boards`, `/api/boards/{id}` GET/PUT/PATCH/DELETE).
- [x] Bootstrap seeding of the original `user`/`password` account + its sample board on a fresh database.
- [x] Frontend: signup mode on `LoginForm`, new `BoardList` component, `KanbanBoard`/`ChatSidebar` updated to be board-scoped.
- [x] Backend tests: `test_auth.py`, `test_board.py`, `test_chat.py` updated; new `test_database.py`, `test_security.py`.
- [x] Frontend tests: `LoginForm.test.tsx` signup cases, new `BoardList.test.tsx`, `KanbanBoard.test.tsx`/`ChatSidebar.test.tsx` updated for `boardId`; `kanban.spec.ts` e2e updated for the board-list flow plus new create/navigate specs.
- [x] Full-stack smoke test against the real (non-mocked) backend in Docker: signup, board CRUD, cross-user isolation (404, not 403, to avoid existence leaks), and restart-persistence.

### Tests and checks

- `uv run pytest tests` (or the Docker fallback) — 38 backend tests passing.
- `npm run lint`, `npm run test:unit` (19 tests), `npm run build`, `npm run test:e2e` (5 specs) — all passing.
- Manual curl smoke test against the live Docker container covering signup, board create/rename/delete, cross-user 404s, duplicate-username 409, short-password 400, and restart persistence.

### Known gaps for future parts

- No board sharing/collaborators — boards are single-owner only.
- No minimum-one-board guard; a user can delete every board (frontend shows an empty-state prompt).
- The optimistic-concurrency guard on AI-driven board updates (discard a stale AI update if the board changed mid-request) was not extended to manual `PUT` saves — a slow manual save can still race another manual save to the same board. Pre-existing gap, not introduced by this part.
- No card metadata beyond title/details (no due dates, labels, assignees, comments) — candidate for Part 12.
- No account settings (change password, delete account).

## Part 12: Card editing and due date / priority metadata

### Decisions

- Fixed a long-standing gap flagged in `docs/review1.md`: `AGENTS.md` requires cards to be "moved with drag and drop, and edited," but only add/delete existed in the UI. Cards can now be edited in place (title, details, due date, priority) via a pencil icon on each card, matching the existing trash-icon affordance.
- Added optional `due_date` (ISO `YYYY-MM-DD`, stored with a `dueDate` JSON alias to match the existing `cardIds`-style camelCase convention) and `priority` (`low`/`medium`/`high`, a plain `Literal` — no custom validator needed) to the `Card` model. Both are optional so existing stored boards deserialize unchanged.
- No new backend endpoints: card edits go through the existing full-board `PUT /api/boards/{id}` the frontend already uses for every board mutation. `strict_json_schema`'s existing recursive walk automatically covers the two new `Card` fields for the AI chat structured-output schema — no changes needed there.
- Editing a card temporarily drops its drag-and-drop listeners (rather than trying to distinguish click-to-edit from a zero-movement drag start) so interacting with the edit form's date/select inputs can never be misread as a drag gesture.
- Priority is shown as a small pill reusing the existing four-color palette (purple for high, yellow for medium, neutral gray for low) rather than introducing new brand colors. An overdue due date (past today, any column) renders in the same red already used for save-error text.

### Checklist

- [x] Backend: `Card.due_date`/`Card.priority` fields (`backend/app/database.py`).
- [x] Frontend: `CardPriority` type, `isOverdue`/`formatDueDate` helpers (`src/lib/kanban.ts`); shared `CardMeta` badge component; inline edit mode in `KanbanCard`; due date + priority inputs in `NewCardForm`; wiring through `KanbanColumn`/`KanbanBoard`.
- [x] Tests: `kanban.test.ts` (`isOverdue`/`formatDueDate`), `KanbanBoard.test.tsx` (edit + cancel-edit flows), `kanban.spec.ts` e2e (edit a card's title/priority end to end).
- [x] Full suite re-run after the change: 38 backend tests, 25 frontend unit tests, 6 Playwright specs — all passing.

## Part 13: Search and filter across a board's cards

### Decisions

- Purely a frontend, client-side feature — no backend or schema changes. The full board is already loaded into the browser, so search/filter is a display-layer concern over data the app already has.
- Filter criteria: free-text search (matches title or details, case-insensitive substring), priority, and an "overdue only" toggle, combinable. Modeled as a single `CardFilter` object (`src/lib/kanban.ts`) with a pure `matchesCardFilter` predicate, unit-tested independently of any component.
- `KanbanColumn` now derives its `SortableContext` `items` from the (possibly filtered) `cards` prop it renders, instead of the column's full unfiltered `cardIds`, so the drag-and-drop item list and the rendered DOM elements always stay 1:1 — filtering can never desync dnd-kit's internal state. Filtered-out cards remain in the underlying board data untouched; only the current view is narrowed.
- Column headers show "X of Y cards" and a distinct "No cards match your filters" empty state (vs. "Drop a card here" for a genuinely empty column) whenever a filter is active, so it is never ambiguous whether a column is empty or just filtered.

### Checklist

- [x] `CardFilter` type, `defaultCardFilter`, `isCardFilterActive`, `matchesCardFilter` (`src/lib/kanban.ts`), unit-tested.
- [x] New `BoardFilterBar` component (search input, priority select, overdue-only checkbox, live match count, clear-filters button).
- [x] `KanbanColumn`/`KanbanBoard` wired to filter cards per column while leaving board data and drag-and-drop untouched.
- [x] Tests: `kanban.test.ts` (filter predicate), `KanbanBoard.test.tsx` (search, priority filter, clear filters), `kanban.spec.ts` e2e (search end to end).
- [x] Full suite re-run: 38 backend tests (unaffected, no backend changes), 35 frontend unit tests, 7 Playwright specs — all passing. Verified visually via screenshots that the filter bar matches the existing design language and the empty/filtered states render correctly.

## Part 14: Account settings (change password, delete account)

### Decisions

- Added `PUT /api/auth/password` (requires the correct current password, enforces the same `MIN_PASSWORD_LENGTH` as signup) and `DELETE /api/auth/account` (requires the correct password, cascades to delete every board the user owns, invalidates every active session for that user - not just the one making the request - and clears the cookie).
- **Found and fixed a real bug while building this**: `_ensure_bootstrap_user` (now `_seed_bootstrap_user`) decided whether to seed the hardcoded `user`/`password` account by checking "are there currently zero users" rather than "was the `users` table just created." That meant deleting the *last* account on the system would silently resurrect the bootstrap credential on the very next request - anyone could delete their account and immediately log back in as `user`/`password` with a fresh sample board. Fixed by checking `sqlite_master` for whether the `users` table already existed before seeding, so bootstrap seeding now runs exactly once, at true first-ever initialization, regardless of how many accounts are later deleted. Verified against the real (non-mocked) Docker backend, not just pytest, since this is exactly the kind of bug that a mocked-DB test could paper over.
- Frontend: new `AccountSettings` component (change-password form + a danger-zone delete-account confirmation requiring the password again), toggled from a button on the board list screen next to "Log out". Reuses the existing `onLogout` callback for "account deleted" - the backend already cleared the cookie/session, so calling the ordinary logout handler is correct and avoids a second bespoke code path.

### Checklist

- [x] Backend: `update_user_password`/`delete_user_account` (`backend/app/database.py`), `PUT /api/auth/password`/`DELETE /api/auth/account` routes, the bootstrap-seeding fix.
- [x] Frontend: `AccountSettings` component, wired into `BoardList`.
- [x] Tests: 11 new backend tests (endpoint + database level, including the resurrection-bug regression case), 12 new frontend unit tests (`AccountSettings.test.tsx` + `BoardList` toggle), 2 new Playwright e2e specs.
- [x] Full suite re-run: 49 backend tests, 42 frontend unit tests, 9 Playwright specs — all passing. Also manually smoke-tested change-password and delete-account against the real Docker container, including the specific resurrection-bug regression check.

## Part 15: Board sharing / collaborators

### Decisions

- New `board_members` table (`board_id`, `user_id`, `added_at`, composite primary key). No roles: any member (owner or invited) can fully view/edit/rename a board's content, matching this project's "keep it simple" convention — only the owner can delete the board or manage membership. This is a deliberate simplification over a real roles model (owner/editor/viewer), left as a future refinement if ever needed.
- Central `_board_access(connection, board_id, user_id) -> (has_access, owner_id)` helper is now the single source of truth for "can this user touch this board." `get_board`, `save_board_content`, and `rename_board` all route through it instead of a strict `owner_id =` match; `delete_board`, `add_board_member`, and `remove_board_member` intentionally bypass it and stay keyed to `owner_id` only.
- `BoardSummary` gained an `is_owner: bool` field so the frontend can show a "Shared" badge and hide owner-only controls (rename/delete/share icons) for boards the user doesn't own. This is a UX nicety only — the backend enforces the real boundary via `_board_access` regardless of what the frontend renders.
- New endpoints: `GET/POST /api/boards/{id}/members`, `DELETE /api/boards/{id}/members/{username}`. All owner-only, all return 404 (not 403) for both "board doesn't exist" and "you don't own it," matching the existing not-found-vs-forbidden convention elsewhere in this API. Adding a member is idempotent (`INSERT OR IGNORE`); adding the owner as a member of their own board or an unknown username are rejected explicitly (400/404).
- Deleting a board or a user account cascades to remove the relevant `board_members` rows (`delete_board` removes the board's own membership rows; `delete_user_account` removes both the rows for boards the user owned and the rows recording their membership elsewhere), so membership never outlives what it points at.
- Frontend: new `ShareBoardPanel` (list current members, invite by username, remove a member) toggled from a new "Share" icon on owned board rows in `BoardList`. Threading the current username down to `BoardList` required `LoginForm.onLogin` to pass back the username from the login/signup response instead of a bare signal, and `page.tsx` to hold onto it — a small but real plumbing change, not just an additive one.

### Checklist

- [x] Backend: `board_members` table, `_board_access`/`is_board_owner`/`list_board_members`/`add_board_member`/`remove_board_member` (`backend/app/database.py`), three new membership routes, `list_boards`/`create_board`/`rename_board` updated for `is_owner`, `delete_board`/`delete_user_account` cascades.
- [x] Frontend: `UsersIcon`, `ShareBoardPanel`, `BoardList` share/shared-badge UI, `LoginForm`/`page.tsx` now thread the username through.
- [x] Tests: 16 new backend tests (database level: member CRUD, access checks, cascade-on-delete for both boards and accounts; endpoint level: share/edit/rename-as-member, owner-only delete/manage-membership, cross-user isolation), 6 new frontend unit tests, 2 new Playwright e2e specs.
- [x] Full suite re-run: 65 backend tests, 44 frontend unit tests, 10 Playwright specs — all passing. Also manually smoke-tested the full authorization matrix (stranger has no access, owner shares, member can edit/rename but not delete/manage-membership, owner revokes, member loses access) against the real Docker container, plus a visual check that the share panel and "Shared" badge match the existing design language.

## Part 16+: candidate future work

Not started. Listed so a future iteration doesn't have to rediscover scope from scratch:

- Card assignee (now meaningful since boards can be shared with more than one user — assign a card to any current board member).
- Symmetric optimistic-concurrency guard on manual board saves (see Part 11's Known gaps).
- Real roles for board sharing (viewer vs. editor) if "everyone with access can fully edit" ever proves too permissive.