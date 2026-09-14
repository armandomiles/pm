# Kanban Database Schema Proposal

## Scope

SQLite will persist the current Kanban board as one JSON document per user. Cards and columns will remain inside the JSON payload so card order and the existing frontend `BoardData` shape are preserved without duplicating domain rules in relational columns.

Authentication sessions and chat conversation history are not stored in SQLite. Authentication remains process-memory-only for the MVP, and chat history remains in the current browser session.

## SQLite table

```sql
CREATE TABLE board_snapshots (
    user_id TEXT PRIMARY KEY,
    board_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

`user_id` is the stable owner key for the future multi-user model. The MVP has one hardcoded user, `user`. `board_json` contains a serialized `BoardData` document. `updated_at` is an ISO 8601 UTC timestamp used for diagnostics and future conflict handling.

Saving a board replaces the row for that user. Loading reads the row and parses the JSON. If no row exists, the backend creates a snapshot from the default board and returns it.

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

The backend must validate that every `cardIds` entry references a card in `cards`, that card IDs are not duplicated across columns, and that each card's `id` matches its map key before replacing a snapshot.

## Initialization and limitations

- The database file and `board_snapshots` table are created on backend startup if absent.
- The database path is configurable for tests and local deployment, with a local SQLite file as the default.
- This is a current-state snapshot, not an audit log. Historical board versions are out of scope for the MVP.
- SQLite writes should replace the complete JSON document in one transaction.
- Schema migrations should be introduced if metadata or the snapshot representation changes.

## Approval needed

Please approve this schema before the backend persistence routes in Part 6 are implemented.