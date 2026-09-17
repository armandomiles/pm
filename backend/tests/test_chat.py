import json

from fastapi.testclient import TestClient

from app.main import ChatResponse, active_sessions, app, strict_json_schema


client = TestClient(app)


def setup_function() -> None:
    active_sessions.clear()


def sign_in() -> None:
    client.post("/api/auth/login", json={"username": "user", "password": "password"})


def default_board_id() -> str:
    boards = client.get("/api/boards").json()
    return boards[0]["id"]


def test_chat_sends_board_question_and_history(monkeypatch) -> None:
    sign_in()
    board_id = default_board_id()
    captured = {}

    def fake_chat(messages, response_format):
        captured["messages"] = messages
        captured["format"] = response_format
        return {"choices": [{"message": {"content": json.dumps({"response": "Done", "board": None})}}]}

    monkeypatch.setattr("app.main.openrouter_chat", fake_chat)

    response = client.post(
        "/api/ai/chat",
        json={
            "board_id": board_id,
            "question": "What should I do next?",
            "history": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"response": "Done", "board": None}
    assert "Current board JSON" in captured["messages"][0]["content"]
    assert captured["messages"][-1] == {"role": "user", "content": "What should I do next?"}
    assert captured["format"]["type"] == "json_schema"


def test_chat_requires_a_board_the_user_owns(monkeypatch) -> None:
    sign_in()

    response = client.post(
        "/api/ai/chat",
        json={"board_id": "does-not-exist", "question": "Move it", "history": []},
    )

    assert response.status_code == 404


def test_chat_persists_valid_board_update(monkeypatch) -> None:
    sign_in()
    board_id = default_board_id()
    board = client.get(f"/api/boards/{board_id}").json()
    board["columns"][0]["title"] = "Queued"
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages, response_format: {
            "choices": [{"message": {"content": json.dumps({"response": "Moved it", "board": board})}}]
        },
    )

    response = client.post("/api/ai/chat", json={"board_id": board_id, "question": "Move it", "history": []})

    assert response.status_code == 200
    assert client.get(f"/api/boards/{board_id}").json()["columns"][0]["title"] == "Queued"


def test_chat_rejects_invalid_structured_output(monkeypatch) -> None:
    sign_in()
    board_id = default_board_id()
    monkeypatch.setattr(
        "app.main.openrouter_chat",
        lambda messages, response_format: {
            "choices": [{"message": {"content": '{"response": 4}'}}]
        },
    )

    assert client.post(
        "/api/ai/chat", json={"board_id": board_id, "question": "Bad", "history": []}
    ).status_code == 502


def test_chat_discards_board_update_that_raced_a_concurrent_save(monkeypatch) -> None:
    sign_in()
    board_id = default_board_id()
    board = client.get(f"/api/boards/{board_id}").json()
    stale_board_update = dict(board)
    stale_board_update["columns"][0]["title"] = "From AI"

    def fake_chat(messages, response_format):
        # Simulate a manual edit landing while the AI request is in flight.
        concurrent_board = client.get(f"/api/boards/{board_id}").json()
        concurrent_board["columns"][0]["title"] = "Manual edit"
        client.put(f"/api/boards/{board_id}", json=concurrent_board)
        return {
            "choices": [
                {"message": {"content": json.dumps({"response": "Moved it", "board": stale_board_update})}}
            ]
        }

    monkeypatch.setattr("app.main.openrouter_chat", fake_chat)

    response = client.post("/api/ai/chat", json={"board_id": board_id, "question": "Move it", "history": []})

    assert response.status_code == 200
    assert response.json()["board"] is None
    assert client.get(f"/api/boards/{board_id}").json()["columns"][0]["title"] == "Manual edit"


def test_strict_json_schema_marks_every_property_required() -> None:
    schema = strict_json_schema(ChatResponse.model_json_schema(by_alias=True))

    assert schema["required"] == ["response", "board"]
    assert schema["additionalProperties"] is False
    board_schema = schema["$defs"]["Board"]
    assert board_schema["required"] == ["columns", "cards"]
    assert board_schema["additionalProperties"] is False
