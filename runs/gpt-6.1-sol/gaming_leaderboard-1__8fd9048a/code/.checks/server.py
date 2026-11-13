import os
import tempfile
from pathlib import Path

from backend.app import create_app

with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as temporary:
    app = create_app({"DATABASE": str(Path(temporary) / "leaderboard.sqlite3")})
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8001")))
