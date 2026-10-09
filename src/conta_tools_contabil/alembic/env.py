"""Alembic env.py — roda em dois contextos:

1. Dev, via `alembic` CLI a partir da raiz do repo (usa o alembic.ini da
   raiz, só pra `alembic revision --autogenerate`).
2. Produção, via `python -m conta_tools_contabil migrar` (migrations.py:
   upgrade_head), que constrói um Config() sem nenhum arquivo .ini.

Resolução da URL do banco, mesma ordem que o CLI usa (cli/_common.py):
override explícito (db.set_database_url) > env var DATABASE_URL >
api.conf ([db] url) > default SQLite local."""

import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from conta_tools_contabil.db import get_database_url, metadata  # noqa: E402

target_metadata = metadata


def _resolver_url() -> str:
    env = os.environ.get("DATABASE_URL")
    if env:
        return env
    conf_path = Path("api.conf")
    if conf_path.exists():
        from conta_tools_contabil.conf import carregar_api_conf
        conf = carregar_api_conf(conf_path)
        if conf.db_url:
            return conf.db_url
    return get_database_url()


def run_migrations_offline() -> None:
    url = _resolver_url()
    context.configure(
        url=url, target_metadata=target_metadata,
        literal_binds=True, dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuracao = config.get_section(config.config_ini_section, {})
    configuracao["sqlalchemy.url"] = _resolver_url()
    connectable = engine_from_config(
        configuracao, prefix="sqlalchemy.", poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
