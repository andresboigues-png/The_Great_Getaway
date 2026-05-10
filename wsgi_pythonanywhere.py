"""WSGI entrypoint for PythonAnywhere (and any plain-WSGI host).

PythonAnywhere generates a stub at
    /var/www/USERNAME_pythonanywhere_com_wsgi.py
which prepends this repo to sys.path and imports `application` from
this file. Centralizing the production entrypoint here keeps PA's
WSGI config a one-liner — it never has to know about src/ layout.

The Flask app object is named `app` everywhere in our code; the WSGI
spec expects a callable named `application` by convention, so we
alias it here. (gunicorn / uwsgi / mod_wsgi all look for one or the
other; aliasing satisfies both.)

Also: src/main.py imports its siblings as `from database import …`
(treats `src/` as the package root, not as a `src.` namespace), so we
prepend src/ to sys.path before the import. That mirrors the dev-time
invocation `cd src && python main.py` documented in the README.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

# Load .env from the repo root with an explicit absolute path. This is
# CRITICAL on PA: src/main.py also calls load_dotenv() but with no args,
# which resolves relative to the WSGI worker's cwd — and PA's WSGI cwd
# is NOT the "Working directory" set in the Web tab. (That setting
# governs Bash-console-style invocations, not the WSGI worker.)
# Loading here, before main is imported, guarantees os.environ is
# populated by the time main.py and its routes evaluate their
# os.getenv() calls. Idempotent — main.py's later load_dotenv() call
# is a no-op once the values are already in os.environ.
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(_HERE, ".env"))

from main import app  # noqa: E402 — sys.path + dotenv must precede this

# WSGI conventional name. PA + gunicorn + uwsgi all look for `application`.
application = app
