from fastapi.testclient import TestClient

from app.ai import AIConfigurationError
from app.main import active_sessions, app


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()


def sign_in() -> None:
    client.post("/api/auth/login", json={"username": "user", "password": "password"})


def test_ai_test_requires_authentication() -> None:
    assert client.post("/api/ai/test").status_code == 401


def test_ai_test_returns_openrouter_answer(monkeypatch) -> None:
    sign_in()
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages: {"choices": [{"message": {"content": "4"}}]},
    )

    response = client.post("/api/ai/test")

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}


def test_ai_test_reports_missing_configuration(monkeypatch) -> None:
    sign_in()
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages: (_ for _ in ()).throw(AIConfigurationError("missing")),
    )

    response = client.post("/api/ai/test")

    assert response.status_code == 503