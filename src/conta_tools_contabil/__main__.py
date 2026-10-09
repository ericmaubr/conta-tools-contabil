"""Entry point: python -m conta_tools_contabil <comando> ..."""

from __future__ import annotations

import sys

from conta_tools_shared.version import handle_version_flags


def main() -> None:
    code = handle_version_flags("conta-tools-contabil", "conta_tools_contabil")
    if code is not None:
        sys.exit(code)

    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        _uso()
        sys.exit(0 if argv else 1)

    cmd, resto = argv[0].lower(), argv[1:]
    if cmd == "migrar":
        from conta_tools_contabil.cli.migrar import main_migrar
        sys.exit(main_migrar(resto))
    elif cmd == "provisionar-db":
        from conta_tools_contabil.cli.provisionar_db import main_provisionar_db
        sys.exit(main_provisionar_db(resto))
    elif cmd == "serve":
        from conta_tools_contabil.cli.serve import main_serve
        sys.exit(main_serve(resto))
    else:
        print(f"Comando não reconhecido: {cmd}")
        print("Disponíveis: migrar, provisionar-db, serve")
        sys.exit(1)


def _uso() -> None:
    print("Uso: python -m conta_tools_contabil <comando> [opcoes]")
    print()
    print("  migrar         Aplica o schema (Alembic upgrade head)")
    print("  provisionar-db Cria role + bancos no Postgres (idempotente)")
    print("  serve          Inicia a API web (--conf api.conf)")
    print()
    print("Flags globais: --version, --about, --help/-h")


if __name__ == "__main__":
    main()
