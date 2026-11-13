import tempfile
from pathlib import Path

from shop import create_app

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="form-field-browser-") as directory:
        application = create_app({"DATABASE": str(Path(directory) / "shop.sqlite3")})
        application.run(host="127.0.0.1", port=8001)
