import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError, model_validator

from app.security import hash_password


DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "project.db"

_BOOTSTRAP_USERNAME = "user"
_BOOTSTRAP_PASSWORD = "password"

_COLUMN_TEMPLATE = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]


class Card(BaseModel):
    id: str
    title: str
    details: str
    due_date: str | None = Field(default=None, alias="dueDate")
    priority: Literal["low", "medium", "high"] | None = None

    model_config = {"populate_by_name": True}


class Column(BaseModel):
    id: str
    title: str
    card_ids: list[str] = Field(alias="cardIds")

    model_config = {"populate_by_name": True}


class Board(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def validate_card_references(self) -> "Board":
        referenced_ids = [card_id for column in self.columns for card_id in column.card_ids]
        if len(referenced_ids) != len(set(referenced_ids)):
            raise ValueError("Cards may only appear in one column")
        if set(referenced_ids) != set(self.cards):
            raise ValueError("Columns must reference every board card exactly once")
        if any(card.id != card_id for card_id, card in self.cards.items()):
            raise ValueError("Card map keys must match card IDs")
        return self


class User(BaseModel):
    id: str
    username: str
    password_hash: str
    created_at: str


class BoardSummary(BaseModel):
    id: str
    name: str
    updated_at: str


def empty_board() -> Board:
    return Board(
        columns=[Column(id=column_id, title=title, cardIds=[]) for column_id, title in _COLUMN_TEMPLATE],
        cards={},
    )


DEFAULT_BOARD = Board(
    columns=[
        Column(id="col-backlog", title="Backlog", cardIds=["card-1", "card-2"]),
        Column(id="col-discovery", title="Discovery", cardIds=["card-3"]),
        Column(id="col-progress", title="In Progress", cardIds=["card-4", "card-5"]),
        Column(id="col-review", title="Review", cardIds=["card-6"]),
        Column(id="col-done", title="Done", cardIds=["card-7", "card-8"]),
    ],
    cards={
        "card-1": Card(id="card-1", title="Align roadmap themes", details="Draft quarterly themes with impact statements and metrics."),
        "card-2": Card(id="card-2", title="Gather customer signals", details="Review support tags, sales notes, and churn feedback."),
        "card-3": Card(id="card-3", title="Prototype analytics view", details="Sketch initial dashboard layout and key drill-downs."),
        "card-4": Card(id="card-4", title="Refine status language", details="Standardize column labels and tone across the board."),
        "card-5": Card(id="card-5", title="Design card layout", details="Add hierarchy and spacing for scanning dense lists."),
        "card-6": Card(id="card-6", title="QA micro-interactions", details="Verify hover, focus, and loading states."),
        "card-7": Card(id="card-7", title="Ship marketing page", details="Final copy approved and asset pack delivered."),
        "card-8": Card(id="card-8", title="Close onboarding sprint", details="Document release notes and share internally."),
    },
)


def database_path() -> Path:
    return Path(os.getenv("PROJECT_DB_PATH", DEFAULT_DB_PATH))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with connect() as connection:
        users_table_existed = (
            connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
            ).fetchone()
            is not None
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                board_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        # Seed exactly once, the moment the users table is first created - not merely
        # "whenever no users currently exist" - so deleting the last account doesn't
        # silently resurrect the bootstrap user/password credential on the next request.
        if not users_table_existed:
            _seed_bootstrap_user(connection)


def _seed_bootstrap_user(connection: sqlite3.Connection) -> None:
    """Seed the original hardcoded user/password account (with its sample board) on a
    fresh database, so existing local setups and the documented MVP credential keep
    working after the move to real per-user accounts."""
    now = datetime.now(timezone.utc).isoformat()
    connection.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
        (_BOOTSTRAP_USERNAME, _BOOTSTRAP_USERNAME, hash_password(_BOOTSTRAP_PASSWORD), now),
    )
    connection.execute(
        "INSERT INTO boards (id, owner_id, name, board_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (uuid4().hex, _BOOTSTRAP_USERNAME, "My Board", board_to_json(DEFAULT_BOARD), now, now),
    )


def board_to_json(board: Board) -> str:
    return board.model_dump_json(by_alias=True)


def board_from_json(value: str) -> Board:
    try:
        return Board.model_validate_json(value)
    except (ValidationError, ValueError) as error:
        raise ValueError("Stored board snapshot is invalid") from error


def create_user(username: str, password: str) -> User:
    initialize_database()
    now = datetime.now(timezone.utc).isoformat()
    password_hash = hash_password(password)
    with connect() as connection:
        try:
            connection.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, username, password_hash, now),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("Username is already taken") from error
    return User(id=username, username=username, password_hash=password_hash, created_at=now)


def get_user_by_username(username: str) -> User | None:
    initialize_database()
    with connect() as connection:
        row = connection.execute(
            "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return None
    return User(id=row["id"], username=row["username"], password_hash=row["password_hash"], created_at=row["created_at"])


def update_user_password(username: str, new_password: str) -> bool:
    initialize_database()
    password_hash = hash_password(new_password)
    with connect() as connection:
        cursor = connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, username),
        )
        return cursor.rowcount > 0


def delete_user_account(username: str) -> bool:
    initialize_database()
    with connect() as connection:
        connection.execute("DELETE FROM boards WHERE owner_id = ?", (username,))
        cursor = connection.execute("DELETE FROM users WHERE id = ?", (username,))
        return cursor.rowcount > 0


def list_boards(owner_id: str) -> list[BoardSummary]:
    initialize_database()
    with connect() as connection:
        rows = connection.execute(
            "SELECT id, name, updated_at FROM boards WHERE owner_id = ? ORDER BY created_at ASC",
            (owner_id,),
        ).fetchall()
    return [BoardSummary(id=row["id"], name=row["name"], updated_at=row["updated_at"]) for row in rows]


def create_board(owner_id: str, name: str, board: Board) -> BoardSummary:
    initialize_database()
    board_id = uuid4().hex
    now = datetime.now(timezone.utc).isoformat()
    with connect() as connection:
        connection.execute(
            "INSERT INTO boards (id, owner_id, name, board_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (board_id, owner_id, name, board_to_json(board), now, now),
        )
    return BoardSummary(id=board_id, name=name, updated_at=now)


def get_board(board_id: str, owner_id: str) -> Board | None:
    initialize_database()
    with connect() as connection:
        row = connection.execute(
            "SELECT board_json FROM boards WHERE id = ? AND owner_id = ?",
            (board_id, owner_id),
        ).fetchone()
    if row is None:
        return None
    return board_from_json(row["board_json"])


def save_board_content(board_id: str, owner_id: str, board: Board) -> bool:
    initialize_database()
    now = datetime.now(timezone.utc).isoformat()
    with connect() as connection:
        cursor = connection.execute(
            "UPDATE boards SET board_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
            (board_to_json(board), now, board_id, owner_id),
        )
        return cursor.rowcount > 0


def rename_board(board_id: str, owner_id: str, name: str) -> BoardSummary | None:
    initialize_database()
    now = datetime.now(timezone.utc).isoformat()
    with connect() as connection:
        cursor = connection.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
            (name, now, board_id, owner_id),
        )
        updated = cursor.rowcount > 0
    if not updated:
        return None
    return BoardSummary(id=board_id, name=name, updated_at=now)


def delete_board(board_id: str, owner_id: str) -> bool:
    initialize_database()
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM boards WHERE id = ? AND owner_id = ?",
            (board_id, owner_id),
        )
        return cursor.rowcount > 0
