"""CLI: python -m conta_tools_contabil provisionar-db

Cria (idempotente) a role de aplicação e os bancos no Postgres. Reexecutar
é seguro — a menos que --recriar-senha seja passado (rotação)."""

from __future__ import annotations

from conta_tools_shared.cli_db import main_provisionar_db as _main_provisionar_db


def main_provisionar_db(argv: list[str]) -> int:
    return _main_provisionar_db(argv, "conta_tools_contabil")
