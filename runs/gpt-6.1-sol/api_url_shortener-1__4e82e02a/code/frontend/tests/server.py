import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app import create_app

with tempfile.TemporaryDirectory() as directory:
    app = create_app(
        {
            "DATABASE": str(Path(directory) / "e2e.sqlite3"),
            "ADMIN_PASSWORD": "e2e-test-admin-password",
        }
    )
    app.run(host="127.0.0.1", port=8001)
