# The Project Management web app

## Business Requirements

This project is a Project Management App. Started as an MVP (single hardcoded login, one board) and expanded, per explicit user direction, into a more comprehensive multi-user tool — see `docs/PLAN.md` Parts 11-18 for the staged expansion decisions. Current key features:
- A user can sign up for a real account or sign in to an existing one
- When signed in, the user sees a list of their Kanban boards (owned and shared with them) and can create, rename, and delete boards
- Each Kanban board has fixed columns that can be renamed
- Cards can be created, edited, deleted, and moved with drag and drop; cards support an optional due date, priority, and assignee
- A board's cards can be searched and filtered (text, priority, overdue-only, assignee)
- A board's owner can share it with other existing users by username; any member (owner or invited) can fully view/edit/rename the board's content, but only the owner can delete the board or manage who has access
- A user can change their password or permanently delete their account (which deletes every board they own) from account settings
- There is an AI chat feature in a sidebar, scoped to the currently open board; the AI is able to create / edit / move one or more cards on that board

## Limitations

Real user accounts (signup + login against SQLite, scrypt-hashed passwords, see `backend/app/security.py`) replaced the single hardcoded credential. The original `user` / `password` account is still seeded automatically on a fresh database so existing setups keep working — but only once, at true first-ever database initialization, not merely "whenever no users currently exist" (deleting the last account must not resurrect it; see `docs/PLAN.md` Part 14).

A signed-in user can own multiple Kanban boards and be invited as a member of boards owned by others. Each board still has the original five fixed-but-renamable columns. Board sharing has no roles beyond owner-vs-member: any member can fully edit/rename a board, only the owner can delete it or manage membership.

Manual board saves and AI-driven board saves both use the same optimistic-concurrency guard (`If-Unmodified-Since` / `X-Board-Updated-At`, see `docs/PLAN.md` Part 17) so two racing saves can't silently overwrite each other's work.

Sessions remain in-memory only (not persisted) — restarting the backend still logs everyone out, by design.

This still runs locally (in a docker container).

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.