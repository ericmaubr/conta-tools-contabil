"""Leitura do api.conf."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from conta_tools_shared.config import Campo, carregar_conf_generico, carregar_ini


@dataclass
class ApiConf:
    host: str = "127.0.0.1"
    port: int = 5017
    # Prefixo do Caddy (`handle_path /contabil/*` remove o prefixo): sem isto o redirect de tela
    # sem sessão manda para /auth/?next=/ e o usuário cai num 404 depois do login.
    root_path: str = ""
    db_url: str = ""
    auth_jwt_segredo: str = ""  # vazio = modo local/dev, sem autorização


def carregar_api_conf(caminho: Path) -> ApiConf:
    if not caminho.exists():
        raise FileNotFoundError(f"api.conf não encontrado: {caminho}")
    campos = carregar_conf_generico(carregar_ini(caminho), [
        Campo("api", "host", "host", default="127.0.0.1"),
        Campo("api", "port", "port", tipo=int, default=5017),
        Campo("api", "root_path", "root_path", rstrip_barra=True),
        Campo("db", "url", "db_url"),
        Campo("auth", "jwt_segredo", "auth_jwt_segredo"),
    ])
    if campos["root_path"]:
        campos["root_path"] = "/" + campos["root_path"].strip("/")
    # mesmo segredo do conta-tools-auth, que o lê desta env: evita copiar o segredo para o disco
    if not campos["auth_jwt_segredo"]:
        campos["auth_jwt_segredo"] = os.environ.get("CONTA_TOOLS_AUTH_JWT_SECRET", "")
    return ApiConf(**campos)
