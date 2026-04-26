"""WSGI entry: always resolve `app` from this directory (avoids wrong `app` on PYTHONPATH)."""

from __future__ import annotations

import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent
_root = str(_backend_root)
if _root not in sys.path:
    sys.path.insert(0, _root)

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    # Single-process dev server (no Werkzeug reloader). On Windows, `flask run` with the reloader
    # often shows two LISTENING PIDs on the same port; Next.js then sometimes gets HTML 404 from the
    # wrong process. Prefer: `cd backend && .venv\Scripts\python wsgi.py`
    import os

    _host = os.environ.get("FLASK_RUN_HOST", "127.0.0.1")
    _port = int(os.environ.get("FLASK_RUN_PORT", "5001"))
    app.run(host=_host, port=_port, debug=False, use_reloader=False, use_debugger=False)
