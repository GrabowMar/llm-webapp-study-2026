# App

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Development

Install the backend dependencies with `pip install -r backend/requirements.txt -c backend/requirements.lock`, then run `gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app` from the workspace root. In `frontend/`, run `npm ci` followed by `npm run dev` for the Vite development server, or `npm run build` to serve the production frontend through Flask.

Accounts, hashed bearer sessions, single-use password reset tokens, and the simulated outbox are persisted in `data/accounts.sqlite3`. No real email is sent. Open **Mailbox** with the account's email address to read its reset link. Reset links expire after one hour; issuing a new link, changing the email, or changing the password invalidates old reset links. Resetting a password signs out all existing sessions.

`DATA_DIR` can override the database directory. `PUBLIC_BASE_URL` can set the public origin used in reset links; otherwise the request origin is used. Registration accepts an optional email; email addresses are unique without regard to case. Clearing an email disables password recovery.

## Checks

- API tests: `python3 -m unittest backend.test_app -v`
- Backend lint (install Ruff first): `ruff check backend`
- Frontend checks, from `frontend/`: `npm run lint`, `npm run typecheck`, `npm run build`
