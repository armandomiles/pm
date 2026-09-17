# Kanban Database Schema

## Scope

SQLite persists real user accounts and one JSON board document per board. Cards and columns remain inside the JSON payload so card order and the frontend `BoardData` shape are preserved without duplicating domain rules in relational columns. A user can own multiple boards.

Authentication sessions and chat conversation history are still not stored in SQLite. Sessions remain process-memory-only (restarting the backend logs everyone out), and chat history remains in the current browser session.

## SQLite tables

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    board_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE board_members (
    board_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
);
```

`users.id` is currently the username itself (usernames are immutable for the MVP, so there is no need for a separate surrogate key). `password_hash` is `scrypt(password, salt)` encoded as `salt_hex$digest_hex` (see `backend/app/security.py`); no third-party hashing dependency was added since Python's stdlib `hashlib.scrypt` is sufficient.

`boards.id` is a generated hex token (not derived from the owner), since a user can own several boards. `boards.owner_id` references `users.id` (no `FOREIGN KEY` enforcement — SQLite's default is off and the app never creates a board without a valid owner). `board_json` contains a serialized `BoardData` document, unchanged in shape from the original single-board design. `updated_at` is an ISO 8601 UTC timestamp.

Saving or renaming a board's content is scoped by `id` and checked against `_board_access` (owner **or** a row in `board_members` for that board+user) rather than a strict `owner_id` match, so an invited member can fully edit and rename a board without being its owner. Both operations report whether the caller had access so the API can return 404 rather than silently no-op. Deleting a board and managing its membership (`board_members` rows) remain strictly owner-only — `delete_board`/`add_board_member`/`remove_board_member` all key off `owner_id`, never shared access. `list_boards` returns the union of boards a user owns and boards where they appear in `board_members`, with an `is_owner` flag on each `BoardSummary` so the frontend can show a "Shared" badge and hide owner-only controls (rename/delete/share icons) for boards the user doesn't own — hiding is a UX nicety only, the backend enforces the real boundary regardless of what the frontend shows.

`GET /api/boards/{id}` exposes the board's `updated_at` via an `X-Board-Updated-At` response header (the `Board` JSON body itself stays columns/cards-only, unchanged, to avoid rippling a timestamp field through the AI-generated board schema and every existing test mock). `PUT /api/boards/{id}` accepts an optional standard `If-Unmodified-Since` request header; if present and the board's stored `updated_at` is newer than it, the save is rejected with `412 Precondition Failed` instead of silently overwriting a change the caller never saw — the same protection `ai_chat` already applied to AI-driven updates (see Part 11), now extended symmetrically to manual saves (Part 17). The header is optional on both ends: omitting it (as `ai_chat`'s own save call and any older client does) skips the check entirely, matching standard HTTP conditional-request semantics.

## Board JSON shape

```json
{
  "columns": [
    {
      "id": "col-backlog",
      "title": "Backlog",
      "cardIds": ["card-1"]
    }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics."
    }
  }
}
```

The backend must validate that every `cardIds` entry references a card in `cards`, that card IDs are not duplicated across columns, and that each card's `id` matches its map key before replacing a snapshot. This validation (`Board.validate_card_references`) is unchanged from the single-board design.

## Bootstrapping and account creation

- On a fresh database (the `users` table does not exist yet), `initialize_database()` seeds the original hardcoded `user` / `password` account with one board named "My Board" containing the original sample cards, so existing local setups and tests keep working unchanged. This check is "does the `users` table already exist," not "are there currently zero users" — the latter would resurrect the bootstrap account the moment someone deleted the last user via `DELETE /api/auth/account`, which was a real bug caught while building account deletion (see `docs/PLAN.md` Part 14).
- `POST /api/auth/signup` creates a new account and one empty board (same five fixed columns, no cards) named "My Board". Username must be non-blank and unique; password must be at least 8 characters.
- New boards created via `POST /api/boards` start with the same five fixed, empty columns. Columns remain fixed-but-renamable per board, matching the original single-board business rule — the "fixed columns" decision was per-board, not per-installation.
- `PUT /api/auth/password` changes the current user's password (requires the correct current password). `DELETE /api/auth/account` requires the correct password, deletes the user row and every board they own, and invalidates every active session for that user.

## Initialization and limitations

- The database file and both tables are created on backend startup if absent, and defensively on every persistence call (tests each use an isolated `PROJECT_DB_PATH`, set *after* the FastAPI app object — and therefore its `lifespan` startup hook — already exists, so the per-call `initialize_database()` guard is load-bearing for test isolation, not just a redundant safety net).
- This is a current-state snapshot per board, not an audit log. Historical board versions are out of scope.
- SQLite writes replace the complete JSON document for one board in one transaction.
- Deleting a board deletes its row outright; there is no soft-delete or trash.
- A user can delete all of their boards (there is no minimum-one-board guard); the frontend's board list shows an empty state with a "create your first board" prompt in that case.
- Boards can be shared: the owner can invite any existing user by username (`POST /api/boards/{id}/members`) and remove them (`DELETE /api/boards/{id}/members/{username}`); `GET /api/boards/{id}/members` lists everyone with access, owner first. There are no roles beyond owner-vs-member — every member can fully view/edit/rename a board's content, matching this project's "keep it simple" convention; only the owner can delete the board or manage its membership. Deleting a board or a user account cascades to remove the corresponding `board_members` rows (see `delete_board`/`delete_user_account`), so membership never outlives the board or the account it points at.
