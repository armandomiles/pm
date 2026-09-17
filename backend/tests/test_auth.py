from fastapi.testclient import TestClient

from app.main import active_sessions, app


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()


def test_login_rejects_invalid_credentials() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "wrong"},
    )

    assert response.status_code == 401


def test_login_rejects_unknown_username() -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "nobody", "password": "password"},
    )

    assert response.status_code == 401


def test_login_creates_memory_session_and_me_returns_user() -> None:
    login_response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == {"username": "user"}
    assert client.get("/api/auth/me").json() == {"username": "user"}


def test_logout_removes_session() -> None:
    client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    logout_response = client.post("/api/auth/logout")

    assert logout_response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_signup_creates_account_and_signs_in(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "signup.db"))

    response = client.post(
        "/api/auth/signup",
        json={"username": "newperson", "password": "correct-horse"},
    )

    assert response.status_code == 201
    assert response.json() == {"username": "newperson"}
    assert client.get("/api/auth/me").json() == {"username": "newperson"}


def test_signup_rejects_duplicate_username(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "signup.db"))
    client.post("/api/auth/signup", json={"username": "taken", "password": "correct-horse"})

    response = client.post("/api/auth/signup", json={"username": "taken", "password": "another-pass"})

    assert response.status_code == 409


def test_signup_rejects_short_password(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "signup.db"))

    response = client.post("/api/auth/signup", json={"username": "shorty", "password": "short"})

    assert response.status_code == 400


def test_signup_rejects_blank_username(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "signup.db"))

    response = client.post("/api/auth/signup", json={"username": "   ", "password": "correct-horse"})

    assert response.status_code == 400


def test_new_account_starts_with_one_empty_board(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "signup.db"))
    client.post("/api/auth/signup", json={"username": "newperson", "password": "correct-horse"})

    boards = client.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"
    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert board["cards"] == {}
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]


def test_change_password_requires_authentication() -> None:
    response = client.put(
        "/api/auth/password",
        json={"current_password": "password", "new_password": "new-password-123"},
    )

    assert response.status_code == 401


def test_change_password_rejects_incorrect_current_password(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "pw.db"))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.put(
        "/api/auth/password",
        json={"current_password": "wrong", "new_password": "new-password-123"},
    )

    assert response.status_code == 401


def test_change_password_rejects_short_new_password(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "pw.db"))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.put(
        "/api/auth/password",
        json={"current_password": "password", "new_password": "short"},
    )

    assert response.status_code == 400


def test_change_password_updates_credential(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "pw.db"))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.put(
        "/api/auth/password",
        json={"current_password": "password", "new_password": "new-password-123"},
    )
    assert response.status_code == 200

    client.post("/api/auth/logout")
    assert client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", json={"username": "user", "password": "new-password-123"}
    ).status_code == 200


def test_delete_account_requires_authentication() -> None:
    response = client.request("DELETE", "/api/auth/account", json={"password": "password"})

    assert response.status_code == 401


def test_delete_account_rejects_incorrect_password(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "delete.db"))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.request("DELETE", "/api/auth/account", json={"password": "wrong"})

    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 200


def test_delete_account_removes_user_boards_and_session(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "delete.db"))
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.request("DELETE", "/api/auth/account", json={"password": "password"})

    assert response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    ).status_code == 401
