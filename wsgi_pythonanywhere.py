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

from main import app  # noqa: E402 — sys.path manipulation must precede this

# WSGI conventional name. PA + gunicorn + uwsgi all look for `application`.
application = app
