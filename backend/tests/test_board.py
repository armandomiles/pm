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


def test_board_get_exposes_updated_at_header(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()

    response = client.get(f"/api/boards/{board_id}")

    assert response.headers.get("x-board-updated-at")


def test_board_put_rejects_a_stale_if_unmodified_since(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()

    initial = client.get(f"/api/boards/{board_id}")
    stale_updated_at = initial.headers["x-board-updated-at"]

    first_edit = initial.json()
    first_edit["columns"][0]["title"] = "First edit"
    first_save = client.put(
        f"/api/boards/{board_id}",
        json=first_edit,
        headers={"If-Unmodified-Since": stale_updated_at},
    )
    assert first_save.status_code == 200
    fresh_updated_at = first_save.headers["x-board-updated-at"]
    assert fresh_updated_at != stale_updated_at

    stale_edit = first_edit.copy()
    stale_edit["columns"][0]["title"] = "Should be rejected"
    conflict = client.put(
        f"/api/boards/{board_id}",
        json=stale_edit,
        headers={"If-Unmodified-Since": stale_updated_at},
    )

    assert conflict.status_code == 412
    assert client.get(f"/api/boards/{board_id}").json()["columns"][0]["title"] == "First edit"

    second_save = client.put(
        f"/api/boards/{board_id}",
        json=stale_edit,
        headers={"If-Unmodified-Since": fresh_updated_at},
    )
    assert second_save.status_code == 200
    assert client.get(f"/api/boards/{board_id}").json()["columns"][0]["title"] == "Should be rejected"


def test_board_put_without_if_unmodified_since_always_saves(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()

    board = client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["title"] = "No precondition sent"

    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200


def test_board_put_rejects_assignee_without_board_access(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "stranger", "password": "supersecret"})
    sign_in()

    board = client.get(f"/api/boards/{board_id}").json()
    card_id = board["columns"][0]["cardIds"][0]

    board["cards"][card_id]["assignee"] = "user"
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200

    board["cards"][card_id]["assignee"] = "stranger"
    response = client.put(f"/api/boards/{board_id}", json=board)
    assert response.status_code == 400
    assert client.get(f"/api/boards/{board_id}").json()["cards"][card_id]["assignee"] == "user"


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


def test_board_round_trips_card_metadata_fields(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    board = client.get(f"/api/boards/{board_id}").json()
    card_id = board["columns"][0]["cardIds"][0]
    board["cards"][card_id]["dueDate"] = "2026-12-31"
    board["cards"][card_id]["priority"] = "high"
    board["cards"][card_id]["assignee"] = "user"

    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200

    saved_card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert saved_card["dueDate"] == "2026-12-31"
    assert saved_card["priority"] == "high"
    assert saved_card["assignee"] == "user"


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


def test_owner_can_share_a_board_with_another_user(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "teammate", "password": "supersecret"})

    sign_in()
    added = client.post(f"/api/boards/{board_id}/members", json={"username": "teammate"})
    assert added.status_code == 201
    assert added.json() == ["user", "teammate"]

    client.post("/api/auth/login", json={"username": "teammate", "password": "supersecret"})
    assert client.get(f"/api/boards/{board_id}").status_code == 200
    shared_boards = client.get("/api/boards").json()
    assert any(b["id"] == board_id and b["is_owner"] is False for b in shared_boards)


def test_shared_member_can_edit_but_not_delete_or_manage_members(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "teammate", "password": "supersecret"})
    sign_in()
    client.post(f"/api/boards/{board_id}/members", json={"username": "teammate"})

    client.post("/api/auth/login", json={"username": "teammate", "password": "supersecret"})
    board = client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["title"] = "Edited by teammate"
    assert client.put(f"/api/boards/{board_id}", json=board).status_code == 200
    assert client.patch(f"/api/boards/{board_id}", json={"name": "Renamed by teammate"}).status_code == 200

    assert client.delete(f"/api/boards/{board_id}").status_code == 404
    assert client.post(f"/api/boards/{board_id}/members", json={"username": "user"}).status_code == 404
    assert client.get(f"/api/boards/{board_id}/members").status_code == 200


def test_owner_can_remove_a_member(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "teammate", "password": "supersecret"})
    sign_in()
    client.post(f"/api/boards/{board_id}/members", json={"username": "teammate"})

    removed = client.delete(f"/api/boards/{board_id}/members/teammate")
    assert removed.status_code == 200
    assert removed.json() == ["user"]

    client.post("/api/auth/login", json={"username": "teammate", "password": "supersecret"})
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_non_owner_cannot_manage_membership_of_a_board_they_cannot_see(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "stranger", "password": "supersecret"})

    assert client.post(f"/api/boards/{board_id}/members", json={"username": "stranger"}).status_code == 404
    assert client.delete(f"/api/boards/{board_id}/members/user").status_code == 404
    assert client.get(f"/api/boards/{board_id}/members").status_code == 404


def test_adding_member_rejects_self_and_unknown_username(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()

    assert client.post(f"/api/boards/{board_id}/members", json={"username": "user"}).status_code == 400
    assert client.post(f"/api/boards/{board_id}/members", json={"username": "nobody"}).status_code == 404


def test_deleting_a_board_removes_access_for_its_members(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "board.db"))
    sign_in()
    board_id = default_board_id()
    client.post("/api/auth/signup", json={"username": "teammate", "password": "supersecret"})
    sign_in()
    client.post(f"/api/boards/{board_id}/members", json={"username": "teammate"})

    assert client.delete(f"/api/boards/{board_id}").status_code == 204

    client.post("/api/auth/login", json={"username": "teammate", "password": "supersecret"})
    assert client.get(f"/api/boards/{board_id}").status_code == 404
