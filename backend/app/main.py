from pathlib import Path
from secrets import token_urlsafe
from contextlib import asynccontextmanager
import json

from fastapi import Cookie, FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.ai import AIConfigurationError, AIRequestError, openrouter_chat
from app.database import Board, Card, Column, initialize_database, load_board, save_board


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

active_sessions: set[str] = set()
DEFAULT_USER_ID = "user"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


DEFAULT_BOARD = Board(
    columns=[
        Column(id="col-backlog", title="Backlog", cardIds=["card-1", "card-2"]),
        Column(id="col-discovery", title="Discovery", cardIds=["card-3"]),
        Column(id="col-progress", title="In Progress", cardIds=["card-4", "card-5"]),
        Column(id="col-review", title="Review", cardIds=["card-6"]),
        Column(id="col-done", title="Done", cardIds=["card-7", "card-8"]),
    ],
    cards={
        "card-1": Card(id="card-1", title="Align roadmap themes", details="Draft quarterly themes with impact statements and metrics."),
        "card-2": Card(id="card-2", title="Gather customer signals", details="Review support tags, sales notes, and churn feedback."),
        "card-3": Card(id="card-3", title="Prototype analytics view", details="Sketch initial dashboard layout and key drill-downs."),
        "card-4": Card(id="card-4", title="Refine status language", details="Standardize column labels and tone across the board."),
        "card-5": Card(id="card-5", title="Design card layout", details="Add hierarchy and spacing for scanning dense lists."),
        "card-6": Card(id="card-6", title="QA micro-interactions", details="Verify hover, focus, and loading states."),
        "card-7": Card(id="card-7", title="Ship marketing page", details="Final copy approved and asset pack delivered."),
        "card-8": Card(id="card-8", title="Close onboarding sprint", details="Document release notes and share internally."),
    },
)


class LoginRequest(BaseModel):
    username: str
    password: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    response: str
    board: Board | None = None


def require_session(session: str | None) -> str:
    if session is None or session not in active_sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return session


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example_api() -> dict[str, str]:
    return {"message": "hello from the API"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    if payload.username != "user" or payload.password != "password":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    session = token_urlsafe(24)
    active_sessions.add(session)
    response.set_cookie("pm_session", session, httponly=True, samesite="lax")
    return {"username": payload.username}


@app.post("/api/auth/logout")
def logout(
    response: Response,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    if session is not None:
        active_sessions.discard(session)
    response.delete_cookie("pm_session")
    return {"status": "ok"}


@app.get("/api/auth/me")
def current_user(
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    require_session(session)
    return {"username": "user"}


@app.get("/api/board", response_model=Board)
def get_board(session: str | None = Cookie(default=None, alias="pm_session")) -> Board:
    require_session(session)
    return load_board(DEFAULT_USER_ID, DEFAULT_BOARD)


@app.put("/api/board", response_model=Board)
def update_board(
    board: Board,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Board:
    require_session(session)
    save_board(DEFAULT_USER_ID, board)
    return board


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
    require_session(session)
    board = load_board(DEFAULT_USER_ID, DEFAULT_BOARD)
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
            "schema": ChatResponse.model_json_schema(by_alias=True),
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
        save_board(DEFAULT_USER_ID, chat_response.board)
    return chat_response


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")