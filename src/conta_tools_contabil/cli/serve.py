"""CLI: python -m conta_tools_contabil serve --conf api.conf"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main_serve(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="conta_tools_contabil serve")
    parser.add_argument("--conf", type=Path, default=Path("api.conf"))
    args = parser.parse_args(argv)
    try:
        from conta_tools_shared.auth.arranque import exigir_autenticacao, sem_autenticacao_declarado

        from conta_tools_contabil import db
        from conta_tools_contabil.conf import carregar_api_conf

        api_conf = carregar_api_conf(args.conf)
        # recusa subir com RBAC desligado por descuido; aqui e não no conf (migrar não usa segredo)
        exigir_autenticacao(
            api_conf.auth_jwt_segredo, sem_autenticacao_declarado(args.conf),
            servico="conta-tools-contabil",
        )
        if api_conf.db_url:
            db.set_database_url(api_conf.db_url)
        from conta_tools_contabil.api.app import create_app

        app = create_app(api_conf)
    except (ValueError, FileNotFoundError) as e:
        print(f"Erro ao ler {args.conf}: {e}", file=sys.stderr)
        return 1

    import uvicorn
    from conta_tools_shared.logging import formatter as log
    from conta_tools_shared.logging.uvicorn_config import uvicorn_log_config

    log.log_info(f"ContaTools Contábil API: http://{api_conf.host}:{api_conf.port}")
    uvicorn.run(
        app, host=api_conf.host, port=api_conf.port, log_level="warning",
        log_config=uvicorn_log_config(), root_path=api_conf.root_path,
    )
    return 0
