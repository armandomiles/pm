# Local Development

## Configuration

Create a root `.env` file with:

```env
OPENROUTER_API_KEY=your-key
```

The key is read only by FastAPI and is never included in the frontend build.

## Docker

Start the application with the platform script from the repository root:

- Windows PowerShell: `./scripts/start.ps1`
- Windows Command Prompt: `scripts\\start.bat`
- macOS or Linux: `./scripts/start.sh`

The application is available at `http://localhost:8000`. Stop it with the matching script in `scripts/stop.*`.

The SQLite database is created at `backend/data/project.db` by default. Set `PROJECT_DB_PATH` to use another path for local testing.
Compose mounts `backend/data` into the container so board snapshots survive container restarts.

## Tests

Run frontend checks from `frontend/`:

```text
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

When the machine has a compatible Chromium binary in a nonstandard Playwright cache, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` before running the E2E suite.

Run backend tests through the uv-based container when `uv` is not installed on the host:

```text
docker run --rm -v "${PWD}/backend:/app/backend" -w /app/backend pm-app uv run --project . --with pytest --with httpx python -m pytest tests
```