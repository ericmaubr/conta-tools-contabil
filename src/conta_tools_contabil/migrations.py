"""Aplica as migrações do Alembic a partir dos scripts empacotados em
conta_tools_contabil/alembic/ — não depende de checkout do repo. É o que
`python -m conta_tools_contabil migrar` chama, caminho oficial em produção."""

from __future__ import annotations

import importlib.resources

from alembic import command
from alembic.config import Config


def upgrade_head() -> None:
    with importlib.resources.as_file(
        importlib.resources.files("conta_tools_contabil") / "alembic"
    ) as script_location:
        cfg = Config()
        cfg.set_main_option("script_location", str(script_location))
        command.upgrade(cfg, "head")
