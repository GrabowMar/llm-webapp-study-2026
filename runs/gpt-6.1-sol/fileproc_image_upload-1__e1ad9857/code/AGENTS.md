## Stack and checks

- Backend: Flask on Python 3.13, entry `backend/app.py`, dependencies and constraints in `backend/requirements.txt` and `backend/requirements.lock`.
- Frontend: React, TypeScript, Vite, Tailwind CSS. Use utility classes; the Tailwind entry is `frontend/src/index.css`.
- Run backend tests from the workspace root: `python3 -m unittest backend.test_app -v`.
- Run backend lint from the workspace root: `python3 -m ruff check backend` (install `ruff` if needed).
- From `frontend/`, run `npm run lint`, `npm run typecheck`, and `npm run build`.
- Preserve the `/api/health` endpoint, port 8000, root Dockerfile, and persistent storage under `./data`.
