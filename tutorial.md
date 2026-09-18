# Project Management App Tutorial

This tutorial explains the Project Management app from the ground up. It is written for someone who is new to frontend development, but it also covers the backend, database, Docker, testing, and AI integration so you can understand how the whole application fits together.

The project started as an MVP (a single hardcoded login, one board) and was later expanded, per explicit user direction, into a real multi-user product. This tutorial describes the app as it exists today; Section 15 walks through a code review that happened while it was still the MVP, and Section 16 summarizes what changed since.

## 1. What This Application Does

The application is a project-management workspace with:

- Real per-user accounts: sign up for a new account or sign in to an existing one.
- A board list per user, showing boards they own and boards shared with them, with create/rename/delete.
- Kanban boards with five fixed-but-renamable columns.
- Cards that can be added, edited, removed, and moved with drag and drop, each with an optional due date, priority, and assignee.
- Search and filtering of cards by text, priority, overdue status, and assignee.
- Board sharing: an owner can invite other existing users by username; any member can fully view/edit/rename the board, but only the owner can delete it or manage membership.
- Account settings: change your password, or permanently delete your account (which deletes every board you own).
- A SQLite database that stores each board as one JSON snapshot, plus relational `users` and `board_members` tables.
- An AI chat sidebar (via OpenRouter), scoped to whichever board is currently open, that can answer questions and optionally create/edit/move cards on that board.
- Optimistic-concurrency protection so two people (or a person and the AI) saving the same board around the same time can't silently clobber each other's work.
- A Docker workflow that serves the built frontend through the FastAPI backend.

Authentication sessions are still deliberately kept in backend memory only, so restarting the backend signs everyone out — that's a conscious simplicity trade-off, not an oversight. Chat history is stored only in the current browser page and is never saved in the database.

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
- **hashlib.scrypt** (Python standard library): password hashing, with no third-party hashing dependency.
- **httpx**: the HTTP client used to call OpenRouter.
- **uv**: the Python dependency and environment manager used in the container.

### Deployment

Docker builds the application in two stages:

1. A Node-based build stage installs frontend dependencies and creates the static Next.js export.
2. A Python/uv runtime stage copies the exported frontend and serves it with FastAPI/Uvicorn.

Docker Compose publishes the application at `http://localhost:8000` and mounts `backend/data` so the database survives container restarts.

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
│   ├── code_review.md
│   └── local-development.md
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── app/
│   │   ├── ai.py
│   │   ├── database.py
│   │   ├── main.py
│   │   └── security.py
│   └── tests/
│       ├── conftest.py
│       ├── test_ai.py
│       ├── test_auth.py
│       ├── test_board.py
│       ├── test_chat.py
│       ├── test_database.py
│       └── test_security.py
├── frontend/
│   ├── next.config.ts
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── BoardList.tsx
│   │   │   ├── AccountSettings.tsx
│   │   │   ├── ShareBoardPanel.tsx
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx / KanbanCard.tsx / KanbanCardPreview.tsx
│   │   │   ├── NewCardForm.tsx / CardMeta.tsx / BoardFilterBar.tsx
│   │   │   └── ChatSidebar.tsx
│   │   └── lib/
│   │       └── kanban.ts
│   └── tests/
│       └── kanban.spec.ts
└── scripts/
    ├── start.bat / start.ps1 / start.sh
    └── stop.bat / stop.ps1 / stop.sh
```

A useful way to read the code is to follow the user journey rather than opening files alphabetically:

1. The browser opens `/`.
2. The frontend checks whether the browser has an authentication cookie (`GET /api/auth/me`).
3. If not signed in, the user signs up or logs in.
4. The frontend loads the user's board list (`GET /api/boards`).
5. The user opens a board (`GET /api/boards/{id}`), which also fetches who has access to it.
6. The user changes the board (rename, add/edit/delete/move a card).
7. The frontend sends the new board to `PUT /api/boards/{id}`.
8. The user can ask the AI a question about the open board through `POST /api/ai/chat`.

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

Sign up for a new account, or, on a fresh database, sign in with the automatically-seeded bootstrap account:

```text
Username: user
Password: password
```

That bootstrap account only gets created once — the very first time the backend initializes a brand-new database file. It exists so old setups and the documented MVP credential keep working; it is not re-created if you later delete every account.

To stop the application:

```powershell
.\scripts\stop.ps1
```

or use the matching `stop.bat` or `stop.sh` script.

## 5. The Frontend Entry Point

The browser starts with `frontend/src/app/page.tsx`. It is a small state machine with three states: "don't know yet," "logged out," and "logged in."

A simplified version looks like this:

```tsx
"use client";

import { useEffect, useState } from "react";
import { BoardList } from "@/components/BoardList";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          setIsAuthenticated(false);
          return;
        }
        const data: { username: string } = await response.json();
        setUsername(data.username);
        setIsAuthenticated(true);
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  if (isAuthenticated === null) {
    return <main>Loading...</main>;
  }

  if (!isAuthenticated || !username) {
    return <LoginForm onLogin={(loggedInUsername) => { setUsername(loggedInUsername); setIsAuthenticated(true); }} />;
  }

  if (!selectedBoard) {
    return (
      <BoardList
        currentUsername={username}
        onSelectBoard={(id, name) => setSelectedBoard({ id, name })}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <KanbanBoard
      boardId={selectedBoard.id}
      boardName={selectedBoard.name}
      onLogout={handleLogout}
      onBack={() => setSelectedBoard(null)}
    />
  );
}
```

There are a few important ideas here:

### State

`isAuthenticated` starts as `null`, which means "we do not know yet." After the `/api/auth/me` request finishes, it becomes either `true` or `false`. `selectedBoard` starts as `null`, which means "on the board list, not inside a specific board yet."

### Conditional rendering

React chooses which screen to show, in order:

- `isAuthenticated === null`: loading screen.
- `isAuthenticated === false`: login/signup form.
- `isAuthenticated === true` and no `selectedBoard`: the board list.
- `isAuthenticated === true` and a `selectedBoard`: that board's Kanban view.

The `@/` import prefix is configured as an alias for the `frontend/src` directory. It lets the code write `@/components/LoginForm` instead of a long relative path.

## 6. Signup, Login, and Sessions

The login form is in `frontend/src/components/LoginForm.tsx`. It toggles between login and signup mode and posts to the matching endpoint:

```tsx
const response = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ username, password }),
});
```

The corresponding backend routes are in `backend/app/main.py`. Signup creates a user row, hashes the password, and immediately gives that new user an empty board:

```python
@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, response: Response) -> dict[str, str]:
    username = payload.username.strip()
    if not username or len(payload.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="...")

    try:
        user = create_user(username, payload.password)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    create_board(user.id, "My Board", empty_board())
    start_session(response, user.id)
    return {"username": user.username}
```

Passwords are never stored in plain text. `backend/app/security.py` hashes them with the standard library's `hashlib.scrypt`:

```python
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_KEY_LENGTH)
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt_hex, digest_hex = password_hash.split("$", 1)
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_KEY_LENGTH)
    return hmac.compare_digest(derived.hex(), digest_hex)
```

A random salt is generated per password with `os.urandom`, so two users with the same password get different hashes. `verify_password` uses `hmac.compare_digest` — a constant-time comparison — instead of `==`, so how quickly the comparison fails can't leak information about the correct hash.

Sessions map a random token to a **user id**, not just a boolean "is logged in":

```python
active_sessions: dict[str, str] = {}

def start_session(response: Response, user_id: str) -> None:
    session = token_urlsafe(24)
    active_sessions[session] = user_id
    response.set_cookie("pm_session", session, httponly=True, samesite="lax")
```

`require_session` looks the token up and returns the associated user id, which every protected route then uses to scope its query:

```python
def require_session(session: str | None) -> str:
    if session is None or session not in active_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return active_sessions[session]
```

```python
@app.get("/api/auth/me")
def current_user(session: str | None = Cookie(default=None, alias="pm_session")) -> dict[str, str]:
    user_id = require_session(session)
    return {"username": user_id}
```

An HTTP-only cookie cannot be read by normal browser JavaScript, which is a useful security property: client-side scripts cannot directly access the session token.

This is intentionally simple and suitable for this project's scope. It is not a production authentication system, because sessions live only in a Python dictionary in process memory — restarting the backend clears `active_sessions` and logs everyone out. Account settings build on the same primitives: `PUT /api/auth/password` re-verifies the current password before hashing and storing a new one, and `DELETE /api/auth/account` re-verifies the password, deletes the user's owned boards and their `board_members` rows, and invalidates every session token that pointed at that user id.

## 7. The Board Data Model

The frontend model lives in `frontend/src/lib/kanban.ts`:

```ts
export type CardPriority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  dueDate?: string | null;
  priority?: CardPriority | null;
  assignee?: string | null;
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

A column does not contain full card objects. It contains card IDs — the order of `cardIds` is the order cards appear in a column. `dueDate`, `priority`, and `assignee` are all optional; a card can have none, some, or all of them.

Separately, a **board list** entry (not the board's contents) is a lightweight summary:

```ts
export type BoardSummary = {
  id: string;
  name: string;
  updated_at: string;
  is_owner: boolean;
};
```

`GET /api/boards` returns a list of these for the signed-in user — every board they own, plus every board they've been invited to as a member — which is what `BoardList.tsx` renders before any specific board is opened.

### Filtering cards

`kanban.ts` also defines the filter shape and a pure matcher function:

```ts
export type CardFilter = {
  text: string;
  priority: CardPriority | "all";
  overdueOnly: boolean;
  assignee: string | "all";
};

export const matchesCardFilter = (card: Card, filter: CardFilter): boolean => {
  if (filter.priority !== "all" && card.priority !== filter.priority) return false;
  if (filter.overdueOnly && !isOverdue(card.dueDate)) return false;
  if (filter.assignee !== "all" && card.assignee !== filter.assignee) return false;
  const text = filter.text.trim().toLowerCase();
  if (text) {
    const haystack = `${card.title} ${card.details}`.toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  return true;
};
```

`isOverdue` compares a card's `dueDate` string against today's date (with the time zeroed out, so "due today" is never overdue). `BoardFilterBar.tsx` renders the search box, priority dropdown, overdue checkbox, and an assignee dropdown built from the board's member list; `KanbanBoard.tsx` filters each column's rendered cards through `matchesCardFilter` without changing the underlying board data, so filtering is purely a display concern.

### Moving cards

The pure function `moveCard` also lives in `kanban.ts`. It receives the current columns and two IDs:

```ts
const nextColumns = moveCard(columns, activeCardId, overId);
```

It handles two main cases: reordering a card inside the same column, and removing a card from one column to insert it into another. Keeping this logic in a pure function is helpful — it doesn't touch the screen or the network, so it's easy to test directly:

```ts
it("moves cards to another column", () => {
  const result = moveCard(baseColumns, "card-2", "card-3");
  expect(result[0].cardIds).toEqual(["card-1"]);
  expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
});
```

## 8. How the Kanban Component Works

`frontend/src/components/KanbanBoard.tsx` owns the interactive board state. It now takes a `boardId` and `boardName`, since a board is no longer singular:

```tsx
type KanbanBoardProps = {
  boardId?: string;
  boardName?: string;
  onLogout?: () => void;
  onBack?: () => void;
};
```

When `boardId` is present (API mode), the component loads that specific board and its member list:

```tsx
const loadBoard = () => {
  setIsLoading(true);
  fetch(`/api/boards/${boardId}`, { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load the board.");
      setLastUpdatedAt(response.headers?.get("X-Board-Updated-At") ?? null);
      setBoard(await response.json());
      setSaveError(null);
      setHasConflict(false);
    })
    .catch(() => setSaveError("Unable to load the board."))
    .finally(() => setIsLoading(false));
};

useEffect(() => {
  if (!isApiMode) return;
  loadBoard();
  fetch(`/api/boards/${boardId}/members`, { credentials: "include" })
    .then(async (response) => (response.ok ? setMembers(await response.json()) : undefined))
    .catch(() => undefined);
}, [isApiMode, boardId]);
```

`X-Board-Updated-At` is captured into `lastUpdatedAt` state. That value is what makes optimistic concurrency work: every save the component makes echoes it back as `If-Unmodified-Since`, so the backend can tell whether the client's copy is still current.

Each board action (rename, add/edit/delete card, drag-and-drop) creates a new board value and sends it through one shared function:

```tsx
const updateBoard = (nextBoard: BoardData) => {
  const previousBoard = board;
  setBoard(nextBoard); // optimistic update: show the change immediately
  if (!isApiMode) return;

  setSaveError(null);
  setHasConflict(false);
  fetch(`/api/boards/${boardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(lastUpdatedAt ? { "If-Unmodified-Since": lastUpdatedAt } : {}),
    },
    credentials: "include",
    body: JSON.stringify(nextBoard),
  }).then((response) => {
    if (!response.ok) {
      const conflict = response.status === 412;
      setHasConflict(conflict);
      setSaveError(conflict ? "This board changed elsewhere." : "Unable to save the board.");
      setBoard(previousBoard); // roll back the optimistic update
      return;
    }
    setLastUpdatedAt(response.headers?.get("X-Board-Updated-At") ?? lastUpdatedAt);
  }).catch(() => {
    setSaveError("Unable to save the board.");
    setBoard(previousBoard);
  });
};
```

If the save fails outright, the UI rolls the board back to what it looked like before the optimistic update (see Bug 2 in Section 15 for why this matters). If it fails specifically because of a `412` conflict — someone else saved a newer version while this browser tab was working from a stale one — the UI shows a distinct message with a "Reload board" button that calls `loadBoard()` again, so the user can pick up the latest version instead of fighting a save that will keep failing.

The drag-and-drop handler is unchanged in shape from the original MVP — it still just calls `moveCard` and hands the result to `updateBoard` — because centralizing persistence in `updateBoard` means every kind of change (a click, a keystroke, a drag) gets the same optimistic-update-plus-rollback-plus-conflict-handling behavior for free.

## 9. SQLite Persistence

The database code is in `backend/app/database.py`.

### Pydantic models

```python
class Card(BaseModel):
    id: str
    title: str
    details: str
    due_date: str | None = Field(default=None, alias="dueDate")
    priority: Literal["low", "medium", "high"] | None = None
    assignee: str | None = None

    model_config = {"populate_by_name": True}


class Column(BaseModel):
    id: str
    title: str
    card_ids: list[str] = Field(alias="cardIds")

    model_config = {"populate_by_name": True}
```

Python uses `card_ids`/`due_date`, while the JSON API uses `cardIds`/`dueDate`. The `alias` lets Python follow its normal naming convention while remaining compatible with the frontend contract.

The `Board` validator protects the relationships between columns and cards — unchanged since the original MVP, because multi-board support just means "more than one of these," not a change to what a valid board looks like:

```python
class Board(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def validate_card_references(self) -> "Board":
        referenced_ids = [card_id for column in self.columns for card_id in column.card_ids]
        if len(referenced_ids) != len(set(referenced_ids)):
            raise ValueError("Cards may only appear in one column")
        if set(referenced_ids) != set(self.cards):
            raise ValueError("Columns must reference every board card exactly once")
        if any(card.id != card_id for card_id, card in self.cards.items()):
            raise ValueError("Card map keys must match card IDs")
        return self
```

`User` and `BoardSummary` are the other two Pydantic models, matching the two new relational tables and the board-list API response respectively.

### SQLite tables

Three tables now exist:

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    board_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_members (
    board_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
);
```

`users.id` is the username itself (usernames are immutable, so there's no need for a separate surrogate key). `boards.id` is a generated hex token, since a user can now own several boards — it can no longer just be the owner's id. The full board (columns + cards) is still serialized as one JSON blob into `board_json`, unchanged in shape from the single-board MVP; this is a snapshot database, not a history database. `board_members` is a join table: one row per (board, user) that has been invited.

### Who can touch a board

Every board-scoped operation is gated through one function, `_board_access`, which is the single source of truth for "can this user touch this board":

```python
def _board_access(connection: sqlite3.Connection, board_id: str, user_id: str) -> tuple[bool, str | None]:
    row = connection.execute("SELECT owner_id FROM boards WHERE id = ?", (board_id,)).fetchone()
    if row is None:
        return False, None
    owner_id = row["owner_id"]
    if owner_id == user_id:
        return True, owner_id
    member_row = connection.execute(
        "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    return member_row is not None, owner_id
```

Reading and saving a board's *content* go through `_board_access` (owner **or** member). Deleting a board and managing its membership stay strictly owner-only, keyed directly off `owner_id` — sharing in this app has exactly two roles: owner and member, nothing finer-grained.

### Bootstrapping

The database is initialized on backend startup and, defensively, on every persistence call (this matters for test isolation — see Section 13). The very first time the `users` table is created, one bootstrap account is seeded:

```python
if not users_table_existed:
    _seed_bootstrap_user(connection)
```

That check is "did the `users` table already exist," not "are there currently zero users." The distinction matters: if it were keyed off row count, deleting the last account through `DELETE /api/auth/account` would silently resurrect the original `user`/`password` credential on the next request — a real bug caught while building account deletion (`docs/PLAN.md` Part 14).

### Saving with optimistic concurrency

`save_board_content` does three things in one pass: checks access, checks for a stale write, and validates assignees, all inside the same connection so there's no gap between the check and the write:

```python
SaveBoardResult = Literal["saved", "not_found", "conflict", "invalid_assignee"]

def save_board_content(
    board_id: str, user_id: str, board: Board, if_unmodified_since: str | None = None,
) -> tuple[SaveBoardResult, str | None]:
    with connect() as connection:
        has_access, owner_id = _board_access(connection, board_id, user_id)
        if not has_access:
            return "not_found", None
        if if_unmodified_since is not None:
            row = connection.execute("SELECT updated_at FROM boards WHERE id = ?", (board_id,)).fetchone()
            if row is not None and row["updated_at"] > if_unmodified_since:
                return "conflict", None
        valid_assignees = {owner_id, *member_user_ids}
        for card in board.cards.values():
            if card.assignee is not None and card.assignee not in valid_assignees:
                return "invalid_assignee", None
        connection.execute(
            "UPDATE boards SET board_json = ?, updated_at = ? WHERE id = ?",
            (board_to_json(board), now, board_id),
        )
    return "saved", now
```

- **`conflict`**: the caller's `If-Unmodified-Since` header is older than the board's current `updated_at` — someone else saved in between. The route turns this into `412 Precondition Failed`.
- **`invalid_assignee`**: a card is assigned to someone who isn't the owner or a current member of *this* board. Checked here, inside the access-check transaction, rather than in the route — so an unauthorized caller can't use a crafted assignee to probe whether a board exists.

The `?` placeholders throughout are important: they let SQLite bind values safely instead of building SQL with string concatenation, which is how SQL injection is avoided.

### Board API routes

```python
@app.get("/api/boards/{board_id}", response_model=Board)
def get_user_board(board_id: str, response: Response, session=Cookie(default=None, alias="pm_session")) -> Board:
    user_id = require_session(session)
    board = get_board(board_id, user_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    updated_at = get_board_updated_at(board_id, user_id)
    if updated_at is not None:
        response.headers["X-Board-Updated-At"] = updated_at
    return board


@app.put("/api/boards/{board_id}", response_model=Board)
def update_user_board(
    board_id: str, board: Board, response: Response,
    session=Cookie(default=None, alias="pm_session"),
    if_unmodified_since: str | None = Header(default=None, alias="If-Unmodified-Since"),
) -> Board:
    user_id = require_session(session)
    result, updated_at = save_board_content(board_id, user_id, board, if_unmodified_since)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Board not found")
    if result == "conflict":
        raise HTTPException(status_code=412, detail="This board was changed elsewhere. Reload to see the latest version before saving.")
    if result == "invalid_assignee":
        raise HTTPException(status_code=400, detail="A card is assigned to someone who doesn't have access to this board.")
    if updated_at is not None:
        response.headers["X-Board-Updated-At"] = updated_at
    return board
```

`get_board` returning `None` covers two cases at once, on purpose: the board doesn't exist, or the caller has no access to it. Both come back as a plain `404`, never a `403` — so a user can't distinguish "that board doesn't exist" from "that board exists but isn't yours" (the same convention is used for the members endpoints — see `docs/database-schema.md`).

FastAPI validates the request body as a `Board` (via Pydantic) before `update_user_board` even runs, so structurally invalid data never reaches SQLite. `GET /api/boards` (list), `POST /api/boards` (create), `PATCH /api/boards/{id}` (rename), and `DELETE /api/boards/{id}` round out board management, and `GET/POST/DELETE /api/boards/{id}/members` manage sharing.

## 10. OpenRouter and the AI Request

The server-side client is in `backend/app/ai.py`:

```python
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"

def openrouter_chat(messages, response_format=None):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AIConfigurationError("OPENROUTER_API_KEY is not configured")

    payload = {"model": MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format

    response = httpx.post(
        OPENROUTER_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
```

The browser never calls OpenRouter directly. Instead, the browser calls FastAPI, and FastAPI adds the secret API key on the server, read from an environment variable that's never sent to the frontend build.

### Structured output

The chat route creates a response schema from the backend model:

```python
response_format = {
    "type": "json_schema",
    "json_schema": {
        "name": "kanban_assistant_response",
        "strict": True,
        "schema": strict_json_schema(ChatResponse.model_json_schema(by_alias=True)),
    },
}
```

`strict_json_schema` is a small recursive fix-up (explained in Section 15, Bug 3) that makes a Pydantic-generated schema satisfy OpenAI-style strict structured outputs, which require every property to be listed as required and every object to set `additionalProperties: false`. The expected response shape is `{"response": "...", "board": null | {...}}`. The backend validates it with `ChatResponse.model_validate`; if it's invalid, the response is rejected and nothing is saved.

### Board-scoped prompt and race protection

The chat request now takes a `board_id`, since the AI operates on one specific board rather than "the" board:

```python
class ChatRequest(BaseModel):
    board_id: str
    question: str
    history: list[ChatMessage] = Field(default_factory=list)
```

```python
@app.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(payload: ChatRequest, session=Cookie(default=None, alias="pm_session")) -> ChatResponse:
    user_id = require_session(session)
    board = get_board(payload.board_id, user_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")

    messages = [
        {"role": "system", "content": f"...Current board JSON:\n{board.model_dump_json(by_alias=True)}"},
        *[message.model_dump() for message in payload.history],
        {"role": "user", "content": payload.question},
    ]
    result = openrouter_chat(messages, response_format)
    chat_response = ChatResponse.model_validate(json.loads(result["choices"][0]["message"]["content"]))

    if chat_response.board is not None:
        if get_board(payload.board_id, user_id) != board:
            # Something changed while we were waiting on the AI - don't clobber it.
            chat_response = chat_response.model_copy(update={"board": None})
        else:
            save_result, _ = save_board_content(payload.board_id, user_id, chat_response.board)
            if save_result != "saved":
                # e.g. the AI assigned a card to someone without board access.
                chat_response = chat_response.model_copy(update={"board": None})
    return chat_response
```

The history comes from the browser and is included in the request but never stored in SQLite. Two safety checks run before an AI-proposed board is persisted: (1) the board must not have changed since the snapshot the AI's answer was based on — a race-condition guard explained in Section 15, Bug 4 — and (2) `save_board_content` must actually report `"saved"`, not `"invalid_assignee"` or a stale-write `"conflict"`. Either failure discards the board from the response, so the client never believes an unpersisted change applied.

## 11. The AI Chat Sidebar

The sidebar is `frontend/src/components/ChatSidebar.tsx`. It now takes a `boardId` prop and includes it in every request, since the assistant is scoped to whichever board is open:

```tsx
type ChatSidebarProps = {
  boardId: string;
  onBoardUpdate: (board: BoardData) => void;
};
```

It holds messages in React state and, on submit, sends the board id plus prior messages as history:

```tsx
const response = await fetch("/api/ai/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ board_id: boardId, question: trimmedQuestion, history: messages }),
});
```

After receiving the response, it adds the assistant's text and applies a returned board if one is present:

```tsx
const result: { response: string; board?: BoardData | null } = await response.json();
setMessages([...nextMessages, { role: "assistant", content: result.response }]);
if (result.board) {
  onBoardUpdate(result.board);
}
```

The parent `KanbanBoard` supplies `onBoardUpdate={updateBoard}`. This means an AI board change goes through the exact same persistence path — including the optimistic-concurrency `If-Unmodified-Since` header — as a human board change.

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

The first stage is temporary; its output (`frontend/out`, the static export) is copied into the final image. The final runtime does not need Node.js to serve the already-built static frontend.

FastAPI serves the exported files:

```python
@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")

app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
```

All API routes are namespaced under `/api`, precisely so they never collide with the static frontend mounted at `/`. Docker Compose also mounts `backend/data` as a volume (so the SQLite file survives container restarts) and defines a health check against `/api/health`, so startup scripts can wait for a ready service.

## 13. Testing Strategy

### Frontend unit tests

Run from `frontend/`:

```bash
npm run lint
npm run build
npm run test:unit
```

Component and logic tests now cover, across `kanban.test.ts` and the `.test.tsx` files next to each component:

- Pure card movement and filter-matching logic.
- Rendering columns, renaming columns, adding/editing/removing cards.
- Login and signup, success and failure.
- The board list: loading, creating, renaming, deleting boards, and the shared-vs-owned distinction.
- Account settings: password change and account deletion flows.
- Board loading/saving, including the optimistic-update rollback on a failed save and the distinct handling of a `412` conflict.
- Chat replies, errors, and AI-driven board updates.

### Backend tests

The backend tests run through the uv-based container:

```bash
docker run --rm \
  -v "${PWD}/backend:/app/backend" \
  -w /app/backend \
  pm-app uv run --project . --with pytest --with httpx python -m pytest tests
```

They're split by concern: `test_security.py` (password hashing/verification), `test_database.py` (SQLite persistence, access control, concurrency), `test_auth.py` (signup/login/session/account-settings routes), `test_board.py` (board CRUD and sharing routes), and `test_chat.py` / `test_ai.py` (mocked OpenRouter integration, structured-output schema, and the race-condition guard). Every test runs through `backend/tests/conftest.py`'s `isolated_database` fixture (see Section 15, Bug 1), so none of them can touch the real `backend/data/project.db`.

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

Imagine a signed-in user opens one of their boards and renames `Backlog` to `Queued`.

1. The user types into the column title input.
2. React calls `handleRenameColumn`, which builds a new `BoardData` object.
3. `updateBoard` immediately updates the visible React state (optimistic update).
4. `updateBoard` sends the complete board to `PUT /api/boards/{boardId}`, including `If-Unmodified-Since: <lastUpdatedAt>`.
5. FastAPI checks the session cookie and resolves it to a user id.
6. `save_board_content` checks `_board_access` (owner or member), checks the `If-Unmodified-Since` header against the stored `updated_at` for a conflict, and checks every card's assignee against the board's current membership.
7. Pydantic already validated the board's structure before this function ran.
8. SQLite updates the row's `board_json` and `updated_at`.
9. The response carries the new `X-Board-Updated-At`, which the frontend stores for the next save.
10. The user sees the new title without refreshing; a later page load retrieves the saved snapshot.

Now imagine the user asks the AI to move a card:

1. The sidebar sends the question, the open board's id, and browser-session history to `POST /api/ai/chat`.
2. FastAPI resolves the session, then loads that specific board from SQLite (checking access along the way).
3. FastAPI adds the board JSON to the system message and asks OpenRouter for a strict JSON-schema response.
4. FastAPI validates the returned `{response, board?}` structure.
5. If a board was returned, FastAPI re-loads the board and compares it to the original snapshot — if it changed while OpenRouter was thinking, the AI's board update is discarded.
6. Otherwise, FastAPI calls `save_board_content` (no `If-Unmodified-Since` from this path); if that reports anything other than `"saved"` (e.g. an invalid assignee), the board update is discarded instead.
7. The response returns to the browser; the sidebar displays the assistant's text.
8. If a board came back, it flows through `onBoardUpdate` — the same `updateBoard` function a human edit uses, including its own `If-Unmodified-Since` header on that save.
9. The user sees the AI's change immediately, or, if it was silently discarded because something conflicted, simply doesn't see an unsafe overwrite happen.

## 15. Code Review: Bugs Found and Fixed (and How)

This section describes work that happened while the app was still the single-board MVP described in the original build. After the MVP was working, the codebase went through a full code review — reading every file in `backend/` and `frontend/` on purpose, looking for bugs, not just skimming. It's kept here because the *process* is as useful to learn from as the bugs themselves, and because the regression tests it produced are still part of the current suite (see Section 13). Section 16 picks up the story from there and summarizes what was built on top of this MVP afterward.

### How the review was done

Two things happened at the same time:

1. An automated review agent was asked to comb through the whole repository in the background, looking specifically for correctness bugs and unnecessary complexity.
2. At the same time, a manual read-through went file by file — every backend route, every React component, the Dockerfile, the test suite, `.gitignore`, everything.

The important lesson here is what happened *after* the automated agent came back with results: **none of its findings were written into the report until they were independently verified.** For example, the agent claimed a JSON schema was missing a required field. Instead of trusting that claim, the actual schema was generated by running the real Python code and printing it out, and the claim was confirmed by reading the raw JSON with our own eyes. This is a good habit for any developer, human or AI: automated tools (linters, AI agents, "it works on my machine") are useful for pointing you in a direction, but you should confirm a bug is real using the same evidence you'd use to convince a skeptical teammate — actual output, an actual failing test, an actual line of code.

The findings were written up in [`docs/code_review.md`](docs/code_review.md), ordered from most to least important. Four were serious enough to fix immediately. (The code snippets below reflect the codebase as it was at the time — a single hardcoded user, one board per installation, no `board_id` — not the multi-board API shown earlier in this tutorial.)

### Bug 1: The test suite was quietly deleting the real database

**The problem:** `backend/tests/test_board.py` had this code, which ran before every test in the file:

```python
def setup_function() -> None:
    active_sessions.clear()
    database_path().unlink(missing_ok=True)  # deletes the SQLite file!
```

`database_path()` returns whatever `PROJECT_DB_PATH` points to. Some tests set that environment variable to a temporary, throwaway file with `monkeypatch.setenv(...)` — but that override only lasts for the one test that set it. By the time the *next* test's `setup_function` ran, the override was gone, and `database_path()` pointed right back at the real file the app uses: `backend/data/project.db`. On top of that, three other test files (`test_ai.py`, `test_auth.py`, `test_chat.py`) never set the environment variable at all, so anything they saved went straight into that same real file.

**Why this matters:** imagine you spend twenty minutes building up a nice board in the running app, then run `pytest` to check your code change didn't break anything. The test suite would silently wipe out or overwrite your board data as a side effect — nothing in the test output would even hint that this happened. We actually watched this happen in this project: running the documented test command left `backend/data/project.db` showing up as "modified" in `git status` right afterward. Making it worse, that same file had accidentally been committed to git in the first place, so this wasn't just a local annoyance — it was polluting the project's history too.

**The fix:** a single shared setup file, `backend/tests/conftest.py`, that `pytest` automatically applies to *every* test:

```python
import pytest


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_DB_PATH", str(tmp_path / "test.db"))
```

`autouse=True` means every single test gets this fixture without asking for it by name. `tmp_path` is a fresh, empty folder pytest creates and deletes automatically for each test. Now no test — old or new — can ever touch the real database file again, because `PROJECT_DB_PATH` always points somewhere temporary. The destructive `unlink()` call was deleted from `test_board.py`, and the committed `backend/data/project.db` was removed from git tracking (`git rm --cached`) with `backend/data/` added to `.gitignore`, since it's a file the app *generates*, not something that belongs in source control. This fixture is still in place today and is why every test file listed in Section 13 can run without touching your real data.

### Bug 2: A failed save left the screen showing something that wasn't actually saved

**The problem:** in `frontend/src/components/KanbanBoard.tsx`, every board change went through one function:

```tsx
const updateBoard = (nextBoard: BoardData) => {
  setBoard(nextBoard); // show the change immediately
  fetch("/api/board", { method: "PUT", /* ... */ }).then((response) => {
    if (!response.ok) {
      setSaveError("Unable to save the board."); // ...but never undo the change above
    }
  });
};
```

This pattern — update the screen right away, before waiting for the server to confirm — is called an **optimistic update**, and it's normally good for making an app feel fast. The bug is what happens when the save *fails*: the code showed a small error message, but never put the board back the way it was. The user would see a red banner, but the board on screen kept showing the unsaved change forever (even surviving further edits), even though the server never actually saved it.

**Why this matters:** picture a flaky Wi-Fi connection. You rename a column, the save fails, you see a brief error message and dismiss it mentally, then keep working. Nothing on screen tells you that what you're looking at no longer matches what's saved on the server — until you reload the page and the rename has vanished.

**The fix:** remember what the board looked like *before* the change, and put it back if the save fails. This is exactly the `previousBoard` / rollback pattern shown in Section 8's current `updateBoard`, which has since grown a second failure branch for `412` conflicts on top of the same rollback:

```tsx
const updateBoard = (nextBoard: BoardData) => {
  const previousBoard = board; // remember where we were
  setBoard(nextBoard);
  fetch("/api/board", { method: "PUT", /* ... */ })
    .then((response) => {
      if (!response.ok) {
        setSaveError("Unable to save the board.");
        setBoard(previousBoard); // undo the optimistic change
      }
    })
    .catch(() => {
      setSaveError("Unable to save the board.");
      setBoard(previousBoard);
    });
};
```

A regression test (`KanbanBoard.test.tsx`) forces a save to fail and checks the card that was "added" during that failed save disappears again — proving the rollback actually works, not just that the error message appears.

### Bug 3: The AI chat feature had a schema bug that could break every real request

**The problem:** the backend asks OpenRouter to reply in a strict, machine-checkable format, built directly from the Python data model:

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

`"strict": True` tells the AI provider "validate the model's answer against this schema exactly, and reject anything that doesn't match." Providers that support this mode (an OpenAI-compatible convention that OpenRouter follows) have a specific rule: **every** field in the schema must be listed as "required," even optional ones — optionality is expressed by allowing the field's type to include `null`, not by leaving it out of the required list. Pydantic, the library generating this schema automatically from the `ChatResponse` Python class, doesn't know about that convention. When we actually generated the schema and printed it, it showed:

```json
"required": ["response"]
```

`board` — an intentionally optional field (`board: Board | None = None`) — was missing from that list. A schema like this is exactly the kind of thing a strict-mode provider is designed to reject before the AI model even sees the question.

**Why this matters:** this bug would never show up in a quick manual test with a mocked AI response (which is exactly how the existing tests worked), only when talking to the real OpenRouter API. The AI chat sidebar — one of the headline features of the app — could have been silently broken for every real user request, and nothing in the test suite would catch it.

**The fix:** a small helper function, `strict_json_schema` (still in `backend/app/main.py` and used exactly as shown in Section 10), walks the generated schema and fixes it up to match what strict mode expects, everywhere it applies:

```python
def strict_json_schema(schema: dict) -> dict:
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
```

This is a **recursive function** — it calls itself on every nested object it finds (the schema for `Board`, `Card`, and `Column` are all nested inside the top-level schema). A regression test, `test_strict_json_schema_marks_every_property_required`, generates the real schema, runs it through this function, and checks the result — so if this ever regresses, the test suite (not a live user) catches it.

### Bug 4: The AI could silently undo a change you just made

**The problem:** when you ask the chat sidebar to do something, the backend (1) loads the current board, (2) sends it to OpenRouter along with your question, (3) waits for a reply — which can take a few real seconds — and (4) saves whatever board the AI sends back:

```python
board = load_board(DEFAULT_USER_ID, DEFAULT_BOARD)   # step 1: snapshot taken here
# ... several seconds pass while OpenRouter thinks ...
if chat_response.board is not None:
    save_board(DEFAULT_USER_ID, chat_response.board)  # step 4: saved unconditionally
```

Nothing checked whether the board had changed *during* those few seconds. If you dragged a card while the AI was still "thinking," that drag would have already been saved via a separate save request — and then the AI's reply, built from the *old* board, would land and overwrite your drag with no warning.

**Why this matters:** this is a classic **race condition** — a bug that only happens depending on the timing of two things happening close together, which makes it maddening to reproduce by hand ("it worked when I tried it just now!"). A user would just see their drag silently "undone" a moment later for no visible reason.

**The fix:** re-check the board immediately before saving the AI's answer, and compare it to the snapshot the AI's answer was based on — this is exactly the check shown in Section 10's current `ai_chat` route:

```python
if chat_response.board is not None:
    if load_board(...) != board:
        # Something changed while we were waiting on the AI - don't clobber it.
        chat_response = chat_response.model_copy(update={"board": None})
    else:
        save_board(..., chat_response.board)
```

If the board on disk still matches what it was when the request started, it's safe to save the AI's version. If it doesn't match, something else won, and the AI's proposed change is thrown away instead of overwriting it. This same idea was later generalized into the `updated_at`-based conflict check described in Sections 9 and 10, so manual saves get the same protection, not just AI-originated ones (`docs/PLAN.md` Part 17). A regression test simulates exactly this: it makes a manual board save happen *in the middle of* the mocked AI call, then checks that the manual edit survives and the AI's board update was dropped.

### How the fixes were checked

For each bug, a **regression test** was added — a test that fails if the bug ever comes back, even if someone doesn't remember this story. Then the entire test suite was run for real, in the same Docker image the app actually ships in, not just "it looks right." `git status` was checked afterward to confirm the real `backend/data/project.db` file was no longer being touched by the test run — the same evidence that revealed Bug 1 in the first place.

## 16. From MVP to Multi-User App

The bug-fixing pass in Section 15 happened while the app still had one hardcoded login and one board. Since then, the app was deliberately expanded, in stages (`docs/PLAN.md` Parts 11-18), into the multi-user product described everywhere else in this tutorial. In roughly the order it happened:

- **Real accounts.** `active_sessions: set[str]` became `active_sessions: dict[str, str]`, mapping a session token to a user id instead of just recording "someone is logged in." The single hardcoded credential was replaced by a `users` table with `hashlib.scrypt`-hashed passwords and a signup flow (Section 6). This directly addresses what used to be listed as this tutorial's top open risk.
- **Multiple boards per user.** `board_snapshots` (one row per user) became `boards` (one row per board, with a generated id and an `owner_id`), plus a board list UI (`BoardList.tsx`) in front of the Kanban view (Section 5, 7, 9).
- **Sharing.** The `board_members` table and `_board_access` helper (Section 9) let an owner invite other users to a board; any member can edit and rename it, only the owner can delete it or manage who else has access.
- **Card metadata and filtering.** `Card` grew `dueDate`, `priority`, and `assignee`; `BoardFilterBar.tsx` and `matchesCardFilter` (Section 7) let a board's cards be searched and filtered by them, with assignee values validated server-side against the board's current membership.
- **Account settings.** Change-password and delete-account routes (Section 6), built on the same session/password-verification primitives as login.
- **Symmetric optimistic concurrency.** The race-condition guard originally built only for the AI path (Section 15, Bug 4) was generalized into an `updated_at` / `If-Unmodified-Since` / `X-Board-Updated-At` conflict check that now protects manual saves too, with a dedicated "this board changed elsewhere, reload" UI state (Section 8, 9).

What's still deliberately unchanged: sessions remain in-memory only (a restart still logs everyone out), a board still has exactly five fixed-but-renamable columns, there are still only two access levels (owner and member, no finer-grained roles), and chat history is still never persisted. These are conscious "keep it simple" decisions, not gaps — see `AGENTS.md` and `docs/PLAN.md` for the reasoning behind each one.

A few opportunities remain genuinely open, if this project keeps growing:

- **Debounced board saves.** Renaming a column can still send one `PUT` per keystroke. A debounced save, with a visible saving/saved indicator and retry on transient failures, would be both gentler on the server and clearer to the user.
- **A shared domain module for the default/empty board template.** The five-column template exists separately in frontend TypeScript (`initialData`/column list) and backend Python (`_COLUMN_TEMPLATE`/`empty_board`). Those copies can drift; a shared schema or a single backend-owned source of truth would remove the duplication.
- **AI safety and observability.** The AI response is structurally validated and race-protected, which is a good foundation, but the backend still accepts a complete model-produced board replacement rather than a constrained set of operations. Validating allowed operations, limiting card/title lengths, recording an audit entry, making AI changes undoable, and logging request IDs/latency/sanitized errors (without ever logging the API key or user content) would all raise the bar here.

## 17. Final Mental Model

Keep this short mental model in mind:

```text
Browser UI
   |
   | fetch JSON requests (credentials: include)
   v
FastAPI routes  (all under /api, never colliding with the static frontend)
   |
   +--> memory-only sessions: token -> user id
   |
   +--> Pydantic validation (Board / Card / Column / User / BoardSummary)
   |
   +--> SQLite: users, boards (owner_id + board_json), board_members
   |        |
   |        +--> _board_access: owner-or-member read/edit
   |        +--> updated_at / If-Unmodified-Since: reject stale writes
   |
   +--> OpenRouter structured AI responses, scoped to one board_id,
   |        re-checked against the board before saving
   |
   +--> static Next.js files at /
```

React controls what the user sees and sends requests, and rolls back optimistic updates on failure. FastAPI controls permissions, validation, persistence, concurrency, and secrets. SQLite remembers every user's boards and who can reach them. OpenRouter provides the assistant response, constrained to a JSON schema and never trusted to overwrite a change it didn't see. Docker packages the pieces so the application can run with one local start command.
