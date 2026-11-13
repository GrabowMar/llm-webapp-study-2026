# Quizly

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `backend.app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions. The frontend uses `frontend/package-lock.json` (`npm ci`). Update the appropriate lock file when changing dependencies.

## Run

```sh
docker build -t quizly .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" -e ADMIN_PASSWORD quizly
```

Set `ADMIN_PASSWORD` in your environment before starting the container to enable the `admin` account. An unset or empty value disables admin sign-in; there is no default password. The SQLite database is initialized with 30 general-knowledge questions on first start. Mount `/app/data` to retain accounts, sessions, questions, and attempts across container replacements.

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/gunicorn --bind 0.0.0.0:8000 backend.app:app
```

For frontend hot reloading, run `npm --prefix frontend run dev` alongside the backend. Vite proxies `/api` to port 8000. `DATA_DIR` optionally changes the database directory, which defaults to `./data`.

## Checks

```sh
.venv/bin/python -m unittest discover -s backend -p 'test_*.py' -v
.venv/bin/ruff check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Install the optional Python lint tool with `.venv/bin/pip install ruff`.

## API notes

Register with a username of 3–32 letters, numbers, or underscores and a password of 8–128 characters. Login returns a bearer token valid for 30 days. Passwords are hashed; only token digests are stored. `GET /api/auth/me` restores the signed-in profile; `POST /api/auth/logout` revokes the current token.

Quiz draws default to 5 questions and accept `count` from 1 to 50, returning up to the number of active questions available. Submission accepts 1–50 distinct answers. `score` is a percentage, and `correct` is the number of correct answers. Anonymous attempts have a null `id` and are not persisted. Signing in from a guest result saves that result to the account. Saved reviews preserve the question and options as they were submitted.

Admin listing defaults to page 1 with 10 questions, with `page_size` up to 100. New questions are active by default; the API also accepts `active: false`. Validation failures return a JSON `error` and, for account creation and question creation, field-specific `errors`.
