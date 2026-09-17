import sqlite3

from fastapi.testclient import TestClient

from app.main import active_sessions, app


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()


def sign_in() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def default_board_id() -> str:
    boards = client.get("/api/boards").json()
    return boards[0]["id"]


def test_boards_require_authentication() -> None:
    assert client.get("/api/boards").status_code == 401


def test_bootstrap_user_has_one_seeded_board(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()

    boards = client.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"


def test_board_is_created_and_persisted_as_json(tmp_path, monkeypatch) -> None:
    database = tmp_path / "board.db"
    monkeypatch.setenv("PROJECT_DB_PATH", str(database))
    sign_in()
    board_id = default_board_id()

    initial = client.get(f"/api/boards/{board_id}")
    changed = initial.json()
    changed["columns"][0]["title"] = "Queued"
    saved = client.put(f"/api/boards/{board_id}", json=changed)

    assert initial.status_code == 200
    assert saved.status_code == 200
    assert client.get(f"/api/boards/{board_id}").json()["columns"][0]["title"] == "Queued"
    assert database.exists()
    with sqlite3.connect(database) as connection:
        snapshot = connection.execute(
            "SELECT board_json FROM boards WHERE id = ?", (board_id,)
        ).fetchone()
    assert snapshot is not None
    assert '"title":"Queued"' in snapshot[0]


def test_board_rejects_invalid_card_references(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    board = client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["cardIds"].append("missing-card")

    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_unknown_board_returns_404(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()

    assert client.get("/api/boards/does-not-exist").status_code == 404
    assert client.put("/api/boards/does-not-exist", json=client.get(f"/api/boards/{default_board_id()}").json()).status_code == 404
    assert client.patch("/api/boards/does-not-exist", json={"name": "New name"}).status_code == 404
    assert client.delete("/api/boards/does-not-exist").status_code == 404


def test_create_list_rename_and_delete_board(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()

    created = client.post("/api/boards", json={"name": "Marketing Launch"})
    assert created.status_code == 201
    board_id = created.json()["id"]

    boards = client.get("/api/boards").json()
    assert {b["name"] for b in boards} == {"My Board", "Marketing Launch"}

    new_board = client.get(f"/api/boards/{board_id}").json()
    assert new_board["columns"][0]["title"] == "Backlog"
    assert new_board["cards"] == {}

    renamed = client.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    deleted = client.delete(f"/api/boards/{board_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_create_board_rejects_blank_name(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()

    assert client.post("/api/boards", json={"name": "   "}).status_code == 400


def test_users_cannot_see_each_others_boards(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    own_board_id = default_board_id()

    signup = client.post("/api/auth/signup", json={"username": "rival", "password": "supersecret"})
    assert signup.status_code == 201
    rival_board_id = client.get("/api/boards").json()[0]["id"]

    assert client.get(f"/api/boards/{own_board_id}").status_code == 404

    sign_in()
    assert client.get(f"/api/boards/{rival_board_id}").status_code == 404
    assert client.get(f"/api/boards/{own_board_id}").status_code == 200
