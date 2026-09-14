import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError, model_validator


DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "project.db"


class Card(BaseModel):
    id: str
    title: str
    details: str


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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS board_snapshots (
                user_id TEXT PRIMARY KEY,
                board_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def board_to_json(board: Board) -> str:
    return board.model_dump_json(by_alias=True)


def board_from_json(value: str) -> Board:
    try:
        return Board.model_validate_json(value)
    except (ValidationError, ValueError) as error:
        raise ValueError("Stored board snapshot is invalid") from error


def load_board(user_id: str, default_board: Board) -> Board:
    initialize_database()
    with connect() as connection:
        row = connection.execute(
            "SELECT board_json FROM board_snapshots WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            save_board(user_id, default_board)
            return default_board
        return board_from_json(row["board_json"])


def save_board(user_id: str, board: Board) -> None:
    initialize_database()
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO board_snapshots (user_id, board_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                board_json = excluded.board_json,
                updated_at = excluded.updated_at
            """,
            (user_id, board_to_json(board), datetime.now(timezone.utc).isoformat()),
        )