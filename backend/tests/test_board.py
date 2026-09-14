import sqlite3

from fastapi.testclient import TestClient

from app.database import database_path
from app.main import active_sessions, app


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()
    database_path().unlink(missing_ok=True)


def sign_in() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def test_board_requires_authentication() -> None:
    assert client.get("/api/board").status_code == 401


def test_board_is_created_and_persisted_as_json(tmp_path, monkeypatch) -> None:
    database = tmp_path / "board.db"
    monkeypatch.setenv("PROJECT_DB_PATH", str(database))
    sign_in()

    initial = client.get("/api/board")
    changed = initial.json()
    changed["columns"][0]["title"] = "Queued"
    saved = client.put("/api/board", json=changed)

    assert initial.status_code == 200
    assert saved.status_code == 200
    assert client.get("/api/board").json()["columns"][0]["title"] == "Queued"
    assert database.exists()
    with sqlite3.connect(database) as connection:
        snapshot = connection.execute(
            "SELECT board_json FROM board_snapshots WHERE user_id = 'user'"
        ).fetchone()
    assert snapshot is not None
    assert '"title":"Queued"' in snapshot[0]


def test_board_rejects_invalid_card_references(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board = client.get("/api/board").json()
    board["columns"][0]["cardIds"].append("missing-card")

    assert client.put("/api/board", json=board).status_code == 422