import json

from fastapi.testclient import TestClient

from app.main import active_sessions, app


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()


def sign_in() -> None:
    client.post("/api/auth/login", json={"username": "user", "password": "password"})


def test_chat_sends_board_question_and_history(monkeypatch) -> None:
    sign_in()
    captured = {}

    def fake_chat(messages, response_format):
        captured["messages"] = messages
        captured["format"] = response_format
        return {"choices": [{"message": {"content": json.dumps({"response": "Done", "board": None})}}]}

    monkeypatch.setattr("app.main.openrouter_chat", fake_chat)

    response = client.post(
        "/api/ai/chat",
        json={
            "question": "What should I do next?",
            "history": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"response": "Done", "board": None}
    assert "Current board JSON" in captured["messages"][0]["content"]
    assert captured["messages"][-1] == {"role": "user", "content": "What should I do next?"}
    assert captured["format"]["type"] == "json_schema"


def test_chat_persists_valid_board_update(monkeypatch) -> None:
    sign_in()
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Queued"
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages, response_format: {
            "choices": [{"message": {"content": json.dumps({"response": "Moved it", "board": board})}}]
        },
    )

    response = client.post("/api/ai/chat", json={"question": "Move it", "history": []})

    assert response.status_code == 200
    assert client.get("/api/board").json()["columns"][0]["title"] == "Queued"


def test_chat_rejects_invalid_structured_output(monkeypatch) -> None:
    sign_in()
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages, response_format: {
            "choices": [{"message": {"content": '{"response": 4}'}}]
        },
    )

    assert client.post("/api/ai/chat", json={"question": "Bad", "history": []}).status_code == 502