# Project Management MVP Tutorial

This tutorial explains the Project Management MVP from the ground up. It is written for someone who is new to frontend development, but it also covers the backend, database, Docker, testing, and AI integration so you can understand how the whole application fits together.

## 1. What This Application Does

The application is a small project-management workspace with:

- A sign-in screen using the MVP credentials `user` / `password`.
- A Kanban board with five columns.
- Editable column names.
- Cards that can be added, removed, and moved with drag and drop.
- A SQLite database that stores each board as one JSON snapshot.
- An AI chat sidebar that can answer questions and optionally return a changed board.
- A Docker workflow that serves the built frontend through the FastAPI backend.

The app is intentionally an MVP. Authentication is stored in backend memory, so restarting the backend signs everyone out. Chat history is stored only in the current browser page and is not saved in the database.

## 2. Technology Summary

### Frontend

The frontend is built with:

- **Next.js**: a React framework that provides the application structure and production build.
- **React**: the library used to create interactive components.
- **TypeScript**: JavaScript with static types, which helps catch mistakes before runtime.
- **Tailwind CSS**: utility classes used for styling.
- **dnd-kit**: the drag-and-drop library used by the Kanban board.
- **Vitest and Testing Library**: unit and component tests.
- **Playwright**: browser-based end-to-end tests.

The frontend is configured with `output: "export"`. That means Next.js creates static files in `frontend/out` instead of requiring a Node server at runtime.

### Backend

The backend is built with:

- **Python**: the backend programming language.
- **FastAPI**: the web framework that defines API routes and validates JSON request bodies.
- **Pydantic**: the validation and data-model library used by FastAPI.
- **SQLite**: a local file-based database.
- **httpx**: the HTTP client used to call OpenRouter.
- **uv**: the Python dependency and environment manager used in the container.

### Deployment

Docker builds the application in two stages:

1. A Node-based build stage installs frontend dependencies and creates the static Next.js export.
2. A Python/uv runtime stage copies the exported frontend and serves it with FastAPI/Uvicorn.

Docker Compose publishes the application at `http://localhost:8000` and mounts `backend/data` so board snapshots survive container restarts.

## 3. Repository Map

The important files are:

```text
project-root/
├── Dockerfile
├── docker-compose.yml
├── .env
├── docs/
│   ├── PLAN.md
│   ├── database-schema.md
│   └── local-development.md
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── app/
│   │   ├── ai.py
│   │   ├── database.py
│   │   └── main.py
│   └── tests/
│       ├── test_ai.py
│       ├── test_auth.py
│       ├── test_board.py
│       └── test_chat.py
├── frontend/
│   ├── next.config.ts
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── tests/
│       └── kanban.spec.ts
└── scripts/
    ├── start.bat
    ├── start.ps1
    ├── start.sh
    ├── stop.bat
    ├── stop.ps1
    └── stop.sh
```

A useful way to read the code is to follow the user journey rather than opening files alphabetically:

1. The browser opens `/`.
2. The frontend checks whether the browser has an authentication cookie.
3. The user signs in.
4. The frontend loads `/api/board`.
5. The user changes the board.
6. The frontend sends the new board to `PUT /api/board`.
7. The user can ask the AI a question through `POST /api/ai/chat`.

## 4. How to Run the Application

### Prerequisites

You need:

- Docker Desktop with Docker Compose.
- Node.js and npm if you want to run frontend commands directly on the host.
- A root `.env` file if you want to use the AI feature:

```env
OPENROUTER_API_KEY=your-key-here
```

The key must stay on the server side. It must not be placed in frontend code or a public file.

### Start the application

From the repository root:

PowerShell:

```powershell
.\scripts\start.ps1
```

Windows Command Prompt:

```bat
scripts\start.bat
```

macOS or Linux:

```bash
./scripts/start.sh
```

Then open:

```text
http://localhost:8000
```

Sign in with:

```text
Username: user
Password: password
```

To stop the application:

```powershell
.\scripts\stop.ps1
```

or use the matching `stop.bat` or `stop.sh` script.

## 5. The Frontend Entry Point

The browser starts with `frontend/src/app/page.tsx`.

A simplified version looks like this:

```tsx
"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => setIsAuthenticated(response.ok))
      .catch(() => setIsAuthenticated(false));
  }, []);

  if (isAuthenticated === null) {
    return <main>Loading...</main>;
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={() => setIsAuthenticated(true)} />;
  }

  return <KanbanBoard onLogout={() => setIsAuthenticated(false)} />;
}
```

There are three important ideas here:

### State

`useState` stores a value that can change while the page is open:

```tsx
const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
```

The initial value is `null`, which means "we do not know yet." After the request finishes, the value becomes either `true` or `false`.

### Effects

`useEffect` runs browser-side code after the component appears. This is where the page asks the backend whether the current browser has a valid session.

### Conditional rendering

React chooses which screen to show:

- `null`: loading screen.
- `false`: login form.
- `true`: Kanban board.

The `@/` import prefix is configured as an alias for the `frontend/src` directory. It lets the code write `@/components/LoginForm` instead of a long relative path.

## 6. Login and Sessions

The login form is in `frontend/src/components/LoginForm.tsx`. When submitted, it sends JSON to the backend:

```tsx
const response = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ username, password }),
});
```

The important pieces are:

- `method: "POST"` says this request changes server state.
- `Content-Type` tells FastAPI that the body is JSON.
- `credentials: "include"` allows the browser to send and receive cookies.
- `body` contains the username and password.

The corresponding backend route is in `backend/app/main.py`:

```python
@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    if payload.username != "user" or payload.password != "password":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    session = token_urlsafe(24)
    active_sessions.add(session)
    response.set_cookie(
        "pm_session",
        session,
        httponly=True,
        samesite="lax",
    )
    return {"username": payload.username}
```

The backend generates a random session token, keeps it in `active_sessions`, and puts the token into an HTTP-only cookie.

An HTTP-only cookie cannot be read by normal browser JavaScript. That is a useful security property because client-side scripts cannot directly access the session token.

The session check is centralized in a helper:

```python
def require_session(session: str | None) -> str:
    if session is None or session not in active_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session
```

Protected routes receive the cookie using FastAPI's `Cookie` dependency:

```python
@app.get("/api/auth/me")
def current_user(
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> dict[str, str]:
    require_session(session)
    return {"username": "user"}
```

This is intentionally simple and suitable for the MVP. It is not a production authentication system because sessions disappear whenever the backend process restarts.

## 7. The Board Data Model

The frontend model lives in `frontend/src/lib/kanban.ts`:

```ts
export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};
```

A board has two parts:

1. `columns`: an ordered list of columns.
2. `cards`: a dictionary of cards indexed by ID.

A column does not contain full card objects. It contains card IDs. For example:

```json
{
  "columns": [
    {
      "id": "col-backlog",
      "title": "Backlog",
      "cardIds": ["card-1"]
    }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics."
    }
  }
}
```

This structure makes ordering explicit. The order of `cardIds` is the order in which cards appear in a column.

### Moving cards

The pure function `moveCard` also lives in `kanban.ts`. It receives the current columns and two IDs:

```ts
const nextColumns = moveCard(columns, activeCardId, overId);
```

It handles two main cases:

- Reordering a card inside the same column.
- Removing a card from one column and inserting it into another.

Keeping this logic in a pure function is helpful. A pure function does not directly change the screen or database. It receives input and returns output, which makes it easy to test:

```ts
it("moves cards to another column", () => {
  const result = moveCard(baseColumns, "card-2", "card-3");

  expect(result[0].cardIds).toEqual(["card-1"]);
  expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
});
```

## 8. How the Kanban Component Works

`frontend/src/components/KanbanBoard.tsx` owns the interactive board state.

The board starts with local initial data:

```tsx
const [board, setBoard] = useState<BoardData>(() => initialData);
```

When the authenticated page passes `onLogout`, the component enters API mode and loads the saved board:

```tsx
useEffect(() => {
  if (!isApiMode) {
    return;
  }

  fetch("/api/board", { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Unable to load the board.");
      }
      setBoard(await response.json());
    })
    .catch(() => setSaveError("Unable to load the board."))
    .finally(() => setIsLoading(false));
}, [isApiMode]);
```

Each board action creates a new board value and sends it to one shared function:

```tsx
const updateBoard = (nextBoard: BoardData) => {
  setBoard(nextBoard);

  if (!isApiMode) {
    return;
  }

  fetch("/api/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(nextBoard),
  });
};
```

This is an example of centralizing a repeated operation. Rename, add, delete, and drag-and-drop all update React immediately and then use the same persistence path.

The drag-and-drop library supplies the active and target IDs:

```tsx
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;

  if (!over || active.id === over.id) {
    return;
  }

  updateBoard({
    ...board,
    columns: moveCard(board.columns, active.id as string, over.id as string),
  });
};
```

The spread expression `...board` copies the existing board object. The new object replaces only the `columns` property. This avoids mutating the old React state directly.

## 9. SQLite Persistence

The database code is in `backend/app/database.py`.

### Pydantic models

The backend defines models that mirror the frontend shape:

```python
class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    card_ids: list[str] = Field(alias="cardIds")

    model_config = {"populate_by_name": True}
```

Python uses `card_ids`, while the JSON API uses `cardIds`. The alias lets Python follow its normal naming convention while remaining compatible with the frontend contract.

The `Board` validator protects the relationships between columns and cards:

```python
class Board(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def validate_card_references(self) -> "Board":
        referenced_ids = [
            card_id
            for column in self.columns
            for card_id in column.card_ids
        ]

        if len(referenced_ids) != len(set(referenced_ids)):
            raise ValueError("Cards may only appear in one column")
        if set(referenced_ids) != set(self.cards):
            raise ValueError("Columns must reference every board card exactly once")
        if any(card.id != card_id for card_id, card in self.cards.items()):
            raise ValueError("Card map keys must match card IDs")
        return self
```

This prevents invalid snapshots such as:

- A card appearing in two columns.
- A card existing in the dictionary but not in any column.
- A column referencing a missing card.
- A dictionary key not matching the card's own `id`.

### SQLite table

The database creates this table automatically:

```sql
CREATE TABLE IF NOT EXISTS board_snapshots (
    user_id TEXT PRIMARY KEY,
    board_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

The full board is serialized into `board_json`. This is a snapshot database, not a history database. Each save replaces the current row for that user.

Saving uses an upsert:

```python
connection.execute(
    """
    INSERT INTO board_snapshots (user_id, board_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
        board_json = excluded.board_json,
        updated_at = excluded.updated_at
    """,
    (
        user_id,
        board_to_json(board),
        datetime.now(timezone.utc).isoformat(),
    ),
)
```

The `?` placeholders are important. They let SQLite bind values safely instead of building SQL with string concatenation.

### Board API routes

The read route is:

```python
@app.get("/api/board", response_model=Board)
def get_board(
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Board:
    require_session(session)
    return load_board(DEFAULT_USER_ID, DEFAULT_BOARD)
```

If the user has no saved board yet, `load_board` stores and returns the default board. Future requests return the stored JSON snapshot.

The write route is:

```python
@app.put("/api/board", response_model=Board)
def update_board(
    board: Board,
    session: str | None = Cookie(default=None, alias="pm_session"),
) -> Board:
    require_session(session)
    save_board(DEFAULT_USER_ID, board)
    return board
```

FastAPI validates the request body as a `Board` before this function runs. Invalid data receives a validation error rather than being written to SQLite.

## 10. OpenRouter and the AI Request

The server-side client is in `backend/app/ai.py`:

```python
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"


def openrouter_chat(
    messages: list[dict[str, str]],
    response_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AIConfigurationError("OPENROUTER_API_KEY is not configured")

    payload = {"model": MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format

    response = httpx.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
```

The browser never calls OpenRouter directly. Instead, the browser calls FastAPI, and FastAPI adds the secret API key on the server.

### Structured output

The chat route creates a response schema from the backend model:

```python
response_format = {
    "type": "json_schema",
    "json_schema": {
        "name": "kanban_assistant_response",
        "strict": True,
        "schema": ChatResponse.model_json_schema(by_alias=True),
    },
}
```

The expected response is:

```json
{
  "response": "I moved the card to Review.",
  "board": null
}
```

or:

```json
{
  "response": "I moved the card to Review.",
  "board": {
    "columns": [],
    "cards": {}
  }
}
```

In a real response, `board` contains the complete valid board rather than only a partial change. The backend validates it with `ChatResponse.model_validate`. If it is invalid, the response is rejected and the stored board is not changed.

### Prompt construction

Every chat request loads the current board and builds messages like this:

```python
messages = [
    {
        "role": "system",
        "content": (
            "You are a project management assistant. "
            f"Current board JSON:\n{board.model_dump_json(by_alias=True)}"
        ),
    },
    *[message.model_dump() for message in payload.history],
    {"role": "user", "content": payload.question},
]
```

The history comes from the browser. It is included in the request but not stored in SQLite.

## 11. The AI Chat Sidebar

The sidebar is `frontend/src/components/ChatSidebar.tsx`.

It holds messages in React state:

```tsx
const [messages, setMessages] = useState<Message[]>([]);
const [question, setQuestion] = useState("");
```

When the user submits a question, the component sends the previous messages as history:

```tsx
const response = await fetch("/api/ai/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    question: trimmedQuestion,
    history: messages,
  }),
});
```

After receiving the response, it adds the assistant's text and applies a returned board:

```tsx
const result: { response: string; board?: BoardData | null } =
  await response.json();

setMessages([
  ...nextMessages,
  { role: "assistant", content: result.response },
]);

if (result.board) {
  onBoardUpdate(result.board);
}
```

The parent `KanbanBoard` supplies `onBoardUpdate={updateBoard}`. This means an AI board change follows the same persistence path as a human board change.

## 12. Docker Build and Request Flow

The Dockerfile uses a multi-stage build:

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock* ./backend/
RUN uv sync --project backend --no-dev
COPY backend ./backend
COPY --from=frontend-build /app/frontend/out ./backend/static

CMD ["uv", "run", "--project", "backend", "uvicorn", "--app-dir", "backend", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The first stage is temporary. Its output is copied into the final image. The final runtime does not need Node.js to serve the already-built static frontend.

FastAPI serves the exported files:

```python
@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
```

Docker Compose also defines a health check against `/api/health`, so startup scripts can wait for a ready service.

## 13. Testing Strategy

### Frontend unit tests

Run from `frontend/`:

```bash
npm run lint
npm run build
npm run test:unit
```

The tests cover:

- Pure card movement logic.
- Rendering five board columns.
- Renaming columns.
- Adding and removing cards.
- Login success and failure.
- Board API loading and saving.
- Chat replies, errors, and AI board updates.

### Backend tests

The backend tests run through the uv-based container:

```bash
docker run --rm \
  -v "${PWD}/backend:/app/backend" \
  -w /app/backend \
  pm-app uv run --project . --with pytest --with httpx python -m pytest tests
```

They cover:

- Invalid and valid login.
- Session and logout behavior.
- Unauthorized board requests.
- SQLite creation and board round trips.
- Invalid board references.
- Mocked OpenRouter responses.
- Structured chat prompt construction.
- Valid and invalid AI board updates.

### Browser tests

The Playwright tests cover the board workflow in a real browser:

```bash
npm run test:e2e
```

The frontend E2E server runs Next.js by itself, so the tests mock the backend routes. This keeps those tests focused on browser interactions. The Docker smoke test separately checks the real FastAPI container.

If Playwright cannot find its normal browser executable but another compatible Chromium is already installed, set:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "C:\path\to\chrome.exe"
```

## 14. A Complete Request Walkthrough

Imagine a user renames `Backlog` to `Queued`.

1. The user types into the column title input.
2. React calls `handleRenameColumn`.
3. `handleRenameColumn` creates a new `BoardData` object.
4. `updateBoard` immediately updates the visible React state.
5. `updateBoard` sends the complete board to `PUT /api/board`.
6. FastAPI checks the session cookie.
7. Pydantic checks the board structure.
8. SQLite stores the serialized JSON in `board_snapshots`.
9. The user sees the new title without refreshing.
10. A later page load retrieves the saved snapshot.

Now imagine the user asks the AI to move a card:

1. The sidebar sends the question and browser-session history to `POST /api/ai/chat`.
2. FastAPI loads the current board from SQLite.
3. FastAPI adds the board JSON to the system message.
4. FastAPI asks OpenRouter for a strict JSON-schema response.
5. FastAPI validates the returned response and optional board.
6. If a board was returned, FastAPI saves it to SQLite.
7. The response returns to the browser.
8. The sidebar displays the assistant text.
9. The board receives the returned board through `onBoardUpdate`.
10. The user sees the AI change immediately.

## 15. Five Self-Review Improvements

The MVP works, but a self-review identifies several worthwhile improvements.

### 1. Replace in-memory sessions with durable authentication

The current `active_sessions` set disappears when the backend restarts, and all sessions are process-local. A stronger version would use signed, expiring session cookies or a session table in SQLite. Passwords should also be hashed rather than hardcoded. This is the most important improvement before exposing the application beyond local MVP use.

### 2. Debounce board saves

Renaming a column currently can send a `PUT /api/board` request for every keystroke. That is simple, but inefficient and vulnerable to overlapping writes. A debounced save could wait briefly after the user stops typing. A better version could also show a clear saving/saved state and retry transient failures.

### 3. Add concurrency protection for board snapshots

The current API replaces the entire board JSON document. Two browser tabs could load the same board, make different edits, and overwrite each other. The `updated_at` value could become a version or revision number. The server could reject stale writes with a conflict response, allowing the frontend to reload and reconcile changes.

### 4. Move the default board into a shared domain module

The default board is currently represented separately in frontend TypeScript and backend Python. Those copies can drift over time. A future design could define a versioned seed document or expose the backend as the source of truth from the beginning. Shared schema generation could also reduce manual duplication while keeping frontend and backend validation aligned.

### 5. Improve AI safety and observability

The AI response is structurally validated, which is a good foundation, but the system still accepts a complete model-produced board replacement. A stronger design would validate allowed operations, limit card/title lengths, record an audit entry, and make AI changes undoable. The backend should also log request IDs, latency, and sanitized error details without logging the API key or sensitive user content.

## 16. Final Mental Model

Keep this short mental model in mind:

```text
Browser UI
   |
   | fetch JSON requests
   v
FastAPI routes
   |
   +--> memory-only authentication sessions
   |
   +--> Pydantic board validation
   |
   +--> SQLite JSON snapshots
   |
   +--> OpenRouter structured AI responses
   |
   +--> static Next.js files at /
```

React controls what the user sees and sends requests. FastAPI controls permissions, validation, persistence, and secrets. SQLite remembers the current board. OpenRouter provides the assistant response. Docker packages the pieces so the application can run with one local start command.
