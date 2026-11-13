"""Pytest configuration: import the Flask app as a top-level module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
