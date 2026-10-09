"""CLI: python -m conta_tools_contabil migrar"""

from __future__ import annotations

import argparse

from conta_tools_contabil.cli._common import adicionar_argumentos_db, configurar_db


def main_migrar(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="conta_tools_contabil migrar")
    adicionar_argumentos_db(parser)
    args = parser.parse_args(argv)
    configurar_db(args)

    from conta_tools_contabil.migrations import upgrade_head

    upgrade_head()
    print("Schema atualizado (alembic upgrade head).")
    return 0
