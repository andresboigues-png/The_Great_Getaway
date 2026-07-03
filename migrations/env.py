import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# ── GG_DB_PATH override (2026-05-17) ─────────────────────────────────
# The alembic.ini ships with `sqlalchemy.url = sqlite:///travel_planner.db`
# — a relative path. Pre-fix, that meant every `alembic upgrade head`
# resolved against the CURRENT WORKING DIRECTORY:
#   - `cd ~/gg && alembic ...`     → ~/gg/travel_planner.db   ← right
#   - `cd ~/gg/src && alembic ...` → ~/gg/src/travel_planner.db ← wrong
# The deploy on 2026-05-17 hit exactly this trap: alembic ran in
# `~/gg/src/`, created a fresh empty DB there, advanced its alembic
# state to head, while the real prod DB at `~/gg/travel_planner.db`
# stayed unmigrated. WSGI then 500'd on the schema check.
#
# Fix: if GG_DB_PATH is set (it is in production via .env), use it as
# the absolute DB path regardless of where alembic is invoked from.
# Falls through to the alembic.ini value when unset (dev/tests).
# Matches the same env-var contract the Flask app reads at runtime
# (see src/database.py:_db_path).
_db_override = os.getenv("GG_DB_PATH")
if _db_override:
    # Allow alembic.ini's logging-section parsing to fire BEFORE we
    # rewrite the url — fileConfig below depends on the config object.
    config.set_main_option("sqlalchemy.url", f"sqlite:///{_db_override}")

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = None

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # PythonAnywhere's networked filesystem can't run SQLite in WAL mode,
        # so the live web worker takes a brief EXCLUSIVE lock on every write
        # (e.g. the per-poll achievement-check commit). alembic's default 5s
        # busy-wait wasn't long enough → "database is locked" mid-migration.
        # Wait up to 60s so the migration rides over the worker's intermittent
        # writes (each <1s, ~15s apart) instead of failing instantly. No
        # effect on a quiet DB (acquires immediately). The runtime workers
        # already tolerate contention via retry_on_lock; this gives alembic
        # the same resilience.
        connect_args={"timeout": 60},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
