# Backend Guide

The `backend/` directory contains the FastAPI service, SQLite board persistence, memory-only authentication, and server-side OpenRouter integration.

## Structure

- `app/main.py` creates the FastAPI application, health and example API routes, and static root serving.
- `app/database.py` defines the validated board models and JSON snapshot persistence.
- `app/ai.py` contains the server-only OpenRouter client.
- `static/` contains the exported frontend when the Docker image is built.
- `tests/` contains backend authentication, board persistence, and AI contract tests.
- `pyproject.toml` declares the Python runtime and FastAPI/Uvicorn dependencies for `uv`.

## Development guidance

- Keep API routes under `/api` so they remain separate from the static frontend root.
- Use FastAPI response and validation types at route boundaries.
- Keep secrets in environment variables. Never put `.env` contents into source or the Docker image.
- Use `uv` for Python dependency management and run the service through Uvicorn.
- Keep `OPENROUTER_API_KEY` server-side and never expose it to frontend code.
- Board snapshots are JSON in SQLite; authentication sessions and chat history are intentionally not persisted.
- Add backend tests alongside each new route or persistence behavior as the plan advances.

## Container workflow

The root `Dockerfile` builds the backend image, and `docker-compose.yml` publishes the service on port `8000`. Platform wrappers in `scripts/` start and stop the Compose service.