"""Flask extensions wired without an `app` reference.

Phase B4 splits `main.py` into one Blueprint per concern. The
Blueprints need `limiter` to apply per-route rate limits, but
importing the limiter from `main.py` would create a circular import
(main.py imports the blueprints, the blueprints import limiter from
main.py).

The standard Flask pattern fixes this with a deferred-init extension
module: instantiate `limiter` here without an `app`, then call
`limiter.init_app(app)` from the app factory in main.py. Blueprints
import `limiter` from this module — no circular dependency.
"""

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# `key_func` decides what to rate-limit by. Per-IP for now; will
# switch to per-user once Phase G's auth lands across every route
# (post-login traffic is identifiable by user_id, which is more
# accurate than IP — proxies + shared IPs collapse otherwise).
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    headers_enabled=True,
)
