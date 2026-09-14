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

EXPOSE 8000

CMD ["uv", "run", "--project", "backend", "uvicorn", "--app-dir", "backend", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]