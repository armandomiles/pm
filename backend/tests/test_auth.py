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