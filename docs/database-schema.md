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
```

`users.id` is currently the username itself (usernames are immutable for the MVP, so there is no need for a separate surrogate key). `password_hash` is `scrypt(password, salt)` encoded as `salt_hex$digest_hex` (see `backend/app/security.py`); no third-party hashing dependency was added since Python's stdlib `hashlib.scrypt` is sufficient.

`boards.id` is a generated hex token (not derived from the owner), since a user can own several boards. `boards.owner_id` references `users.id` (no `FOREIGN KEY` enforcement — SQLite's default is off and the app never creates a board without a valid owner). `board_json` contains a serialized `BoardData` document, unchanged in shape from the original single-board design. `updated_at` is an ISO 8601 UTC timestamp.

Saving a board's content replaces `board_json` for that row (scoped by `id` **and** `owner_id`, so one user can never overwrite another's board even by guessing an id). Renaming a board only touches `name`/`updated_at`. Both operations report whether a matching row existed so the API can return 404 rather than silently no-op.

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

- On a fresh database, `initialize_database()` seeds the original hardcoded `user` / `password` account with one board named "My Board" containing the original sample cards, so existing local setups and tests keep working unchanged.
- `POST /api/auth/signup` creates a new account and one empty board (same five fixed columns, no cards) named "My Board". Username must be non-blank and unique; password must be at least 8 characters.
- New boards created via `POST /api/boards` start with the same five fixed, empty columns. Columns remain fixed-but-renamable per board, matching the original single-board business rule — the "fixed columns" decision was per-board, not per-installation.

## Initialization and limitations

- The database file and both tables are created on backend startup if absent, and defensively on every persistence call (tests each use an isolated `PROJECT_DB_PATH`, set *after* the FastAPI app object — and therefore its `lifespan` startup hook — already exists, so the per-call `initialize_database()` guard is load-bearing for test isolation, not just a redundant safety net).
- This is a current-state snapshot per board, not an audit log. Historical board versions are out of scope.
- SQLite writes replace the complete JSON document for one board in one transaction.
- Deleting a board deletes its row outright; there is no soft-delete or trash.
- A user can delete all of their boards (there is no minimum-one-board guard); the frontend's board list shows an empty state with a "create your first board" prompt in that case.
- Boards are not shared between users. There is no membership/collaborator concept yet.
