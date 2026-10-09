"""Helpers compartilhados entre subcomandos do CLI."""

from __future__ import annotations

import argparse

from conta_tools_shared.cli_db import adicionar_argumentos_db as _adicionar_argumentos_db
from conta_tools_shared.cli_db import configurar_db as _configurar_db


def adicionar_argumentos_db(parser: argparse.ArgumentParser) -> None:
    _adicionar_argumentos_db(parser, nome_conf_default="api.conf")


def configurar_db(args: argparse.Namespace) -> None:
    """Resolve a URL do banco: --db-url > env DATABASE_URL > api.conf > default SQLite."""
    from conta_tools_contabil import db
    from conta_tools_contabil.conf import carregar_api_conf

    _configurar_db(args, db, carregar_api_conf)
