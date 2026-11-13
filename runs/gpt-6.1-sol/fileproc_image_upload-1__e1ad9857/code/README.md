# Folio

A responsive, public image gallery with accounts, original-quality PNG/JPEG uploads, and owner-only deletion. Built with Flask, React, TypeScript, Vite, and Tailwind CSS.

## Run

```sh
docker build -t folio .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" folio
```

Open `http://localhost:8000`. The volume preserves accounts, sessions, metadata, and image bytes across container restarts.

## Local development

```sh
python3 -m pip install -r backend/requirements.txt -c backend/requirements.lock
python3 -m flask --app backend.app run --port 8000
```

In a second terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Vite proxies `/api` to Flask. Run `npm run build` to generate the production frontend that Flask serves at `/`.

## Verification

```sh
python3 -m unittest backend.test_app -v
python3 -m pip install ruff
python3 -m ruff check backend
```

From `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
```

## API and storage

- Register with `POST /api/auth/register`, then sign in with `POST /api/auth/login`. Both accept JSON `username` and `password` fields. Login returns a token for the `Authorization: Bearer <token>` header.
- `GET /api/auth/me` returns the signed-in username. `POST /api/auth/logout` revokes the current token. Sessions expire after 30 days and survive server restarts; passwords and tokens are stored only as hashes.
- `GET /api/images?page=1&page_size=12` returns newest-first image descriptions and a total count. Page sizes range from 1–100. Optional `q` and `uploader` filters support gallery search and the My uploads tab.
- `POST /api/images` accepts JSON `filename`, base64 `data`, and optional `title`. Maximum image size is 15 MB; dimensions are limited to 40 million pixels. Pillow validates PNG/JPEG content independently of the filename, and the original bytes are never re-encoded.
- `GET /api/images/{id}` returns the description. `GET /api/images/{id}/file` serves its original bytes publicly. `DELETE /api/images/{id}` requires the uploader’s token and atomically deletes both metadata and stored bytes.
- SQLite stores metadata and image-file BLOBs in `./data/gallery.sqlite3`, so uploads and deletions are transactional and cannot leave orphaned files. Set `DATA_DIR` to override the storage directory.
- API errors return JSON `{"error": "message"}`. The frontend displays those messages directly.

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).
