from pathlib import Path
from secrets import token_urlsafe
from contextlib import asynccontextmanager
import json

from fastapi import Cookie, FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.ai import AIConfigurationError, AIRequestError, openrouter_chat
from app.database import (
    Board,
    BoardSummary,
    create_board,
    create_user,
    delete_board,
    delete_user_account,
    empty_board,
    get_board,
    get_user_by_username,
    initialize_database,
    list_boards,
    rename_board,
    save_board_content,
    update_user_password,
)
from app.security import verify_password


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

active_sessions: dict[str, str] = {}
MIN_PASSWORD_LENGTH = 8


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    password: str


class CreateBoardRequest(BaseModel):
    name: str


class RenameBoardRequest(BaseModel):
    name: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    board_id: str
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    response: str
    board: Board | None = None


def require_session(session: str | None) -> str:
    if session is None or session not in active_sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return active_sessions[session]


def strict_json_schema(schema: dict) -> dict:
    """Make a Pydantic-generated schema satisfy OpenAI-style strict structured outputs,
    which require every property to be listed as required (optionality is expressed via
    a nullable type) and every object to set additionalProperties: false."""
    if schema.get("type") == "object" and "properties" in schema:
        schema["required"] = list(schema["properties"])
        schema.setdefault("additionalProperties", False)
    for value in schema.values():
        if isinstance(value, dict):
            strict_json_schema(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    strict_json_schema(item)
    return schema


def start_session(response: Response, user_id: str) -> None:
    session = token_urlsafe(24)
    active_sessions[session] = user_id
    response.set_cookie("pm_session", session, httponly=True, samesite="lax")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example_api() -> dict[str, str]:
    return {"message": "hello from the API"}


@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, response: Response) -> dict[str, str]:
    username = payload.username.strip()
    if not username or len(payload.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username is required and password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    try:
        user = create_user(username, payload.password)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    create_board(user.id, "My Board", empty_board())
    start_session(response, user.id)
    return {"username": user.username}


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    user = get_user_by_username(payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    start_session(response, user.id)
    return {"username": user.username}


@app.post("/api/auth/logout")
def logout(
    response: Response,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    if session is not None:
        active_sessions.pop(session, None)
    response.delete_cookie("pm_session")
    return {"status": "ok"}


@app.get("/api/auth/me")
def current_user(
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    user_id = require_session(session)
    return {"username": user_id}


@app.put("/api/auth/password")
def change_password(
    payload: ChangePasswordRequest,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    user_id = require_session(session)
    user = get_user_by_username(user_id)
    if user is None or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    if len(payload.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    update_user_password(user_id, payload.new_password)
    return {"status": "ok"}


@app.delete("/api/auth/account")
def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    user_id = require_session(session)
    user = get_user_by_username(user_id)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password is incorrect")

    delete_user_account(user_id)
    for token in [token for token, owner in active_sessions.items() if owner == user_id]:
        active_sessions.pop(token, None)
    response.delete_cookie("pm_session")
    return {"status": "ok"}


@app.get("/api/boards", response_model=list[BoardSummary])
def list_user_boards(session: str | None = Cookie(default=None, alias="pm_session")) -> list[BoardSummary]:
    user_id = require_session(session)
    return list_boards(user_id)


@app.post("/api/boards", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def create_user_board(
    payload: CreateBoardRequest,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> BoardSummary:
    user_id = require_session(session)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Board name is required")
    return create_board(user_id, name, empty_board())


@app.get("/api/boards/{board_id}", response_model=Board)
def get_user_board(
    board_id: str,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Board:
    user_id = require_session(session)
    board = get_board(board_id, user_id)
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return board


@app.put("/api/boards/{board_id}", response_model=Board)
def update_user_board(
    board_id: str,
    board: Board,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Board:
    user_id = require_session(session)
    if not save_board_content(board_id, user_id, board):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return board


@app.patch("/api/boards/{board_id}", response_model=BoardSummary)
def rename_user_board(
    board_id: str,
    payload: RenameBoardRequest,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> BoardSummary:
    user_id = require_session(session)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Board name is required")
    summary = rename_board(board_id, user_id, name)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return summary


@app.delete("/api/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_board(
    board_id: str,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Response:
    user_id = require_session(session)
    if not delete_board(board_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/ai/test")
def ai_test(session: str | None = Cookie(default=None, alias="pm_session")) -> dict[str, str]:
    require_session(session)
    try:
        result = openrouter_chat([{"role": "user", "content": "What is 2+2? Reply with only the number."}])
    except AIConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIRequestError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise HTTPException(status_code=502, detail="OpenRouter returned an invalid response") from error
    return {"answer": str(content)}


@app.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(
    payload: ChatRequest,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> ChatResponse:
    user_id = require_session(session)
    board = get_board(payload.board_id, user_id)
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")

    messages = [
        {
            "role": "system",
            "content": (
                "You are a project management assistant. Use the board JSON below to answer the user. "
                "Return a board only when a requested change is appropriate.\n\n"
                f"Current board JSON:\n{board.model_dump_json(by_alias=True)}"
            ),
        },
        *[message.model_dump() for message in payload.history],
        {"role": "user", "content": payload.question},
    ]
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "kanban_assistant_response",
            "strict": True,
            "schema": strict_json_schema(ChatResponse.model_json_schema(by_alias=True)),
        },
    }
    try:
        result = openrouter_chat(messages, response_format)
    except AIConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AIRequestError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    try:
        content = result["choices"][0]["message"]["content"]
        response_data = json.loads(content) if isinstance(content, str) else content
        chat_response = ChatResponse.model_validate(response_data)
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise HTTPException(status_code=502, detail="OpenRouter returned invalid structured output") from error

    if chat_response.board is not None:
        if get_board(payload.board_id, user_id) != board:
            # The board changed while the AI request was in flight; discard this
            # update rather than silently overwriting the newer, concurrent change.
            chat_response = chat_response.model_copy(update={"board": None})
        else:
            save_board_content(payload.board_id, user_id, chat_response.board)
    return chat_response


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
