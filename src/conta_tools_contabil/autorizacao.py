"""Autorização do conta-tools-contabil: pessoa com token do conta-tools-auth (header ou cookie),
papel por módulo. Não há chave de serviço nesta fase: nenhum serviço chama o contabil.

Adaptado de `conta_tools_nfts/autorizacao.py`, sem a parte de serviço."""

from __future__ import annotations

import logging

from conta_tools_shared.auth.cookie import COOKIE_NOME, extrair_bearer
from conta_tools_shared.auth.token import verificar as verificar_token_assinado
from fastapi import Cookie, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

SISTEMA = "conta-tools-contabil"

# Hierarquia: quem é `responsavel` satisfaz `operador` e `leitura`.
_ORDEM_PAPEL = {"leitura": 0, "operador": 1, "responsavel": 2}
_PAPEIS_VALIDOS = frozenset(_ORDEM_PAPEL)

# Módulos do catálogo do conta-tools-auth (docs/ACESSOS.md). Existe para `exigir()` recusar módulo
# com typo na montagem: sem isso a rota viraria 403 para todo mundo, só visto em produção.
_MODULOS_VALIDOS = frozenset({"conciliacao", "ia"})


def _papel_atende(papel_usuario, papel_minimo: str) -> bool:
    if not isinstance(papel_usuario, str):
        return False  # claim adulterado (lista/número/etc): não atende nada
    return _ORDEM_PAPEL.get(papel_usuario, -1) >= _ORDEM_PAPEL[papel_minimo]


_security = HTTPBearer(auto_error=False)

_jwt_segredo: str = ""


def configurar(jwt_segredo: str) -> None:
    """Chamado uma vez por `create_app`. Global de módulo porque as dependencies são montadas na
    declaração das rotas e leem isto no request."""
    global _jwt_segredo
    _jwt_segredo = jwt_segredo or ""
    if not _jwt_segredo:
        logger.warning(
            "auth: segredo ausente nas DUAS fontes ([auth] jwt_segredo do api.conf e env "
            "CONTA_TOOLS_AUTH_JWT_SECRET) — modo local/dev, autorizacao DESLIGADA. Em producao o "
            "normal e a chave vazia e a env setada: confira se o processo enxerga a env."
        )


def esta_ligada() -> bool:
    """False = modo local/dev, tudo liberado. Alimenta o `/status`."""
    return bool(_jwt_segredo)


def _bruto(credentials: HTTPAuthorizationCredentials | None, cookie: str | None) -> str | None:
    autorizacao_header = f"Bearer {credentials.credentials}" if credentials else None
    return extrair_bearer(autorizacao_header, cookie)


def _checar_credencial(bruto: str | None, pares: tuple[tuple[str, str], ...] | None) -> None:
    if bruto is None:
        raise HTTPException(status_code=401, detail="Token ausente")
    payload = verificar_token_assinado(bruto, _jwt_segredo)
    if payload is None:
        raise HTTPException(status_code=401, detail="Token inválido")

    papeis = payload.get("papeis", {})
    if not isinstance(papeis, dict):
        papeis = {}  # token malformado/adulterado: trata como sem nenhum papel
    if pares is None:  # exigir_sessao(): basta ter algum papel neste sistema
        if not any(k.startswith(f"{SISTEMA}.") for k in papeis):
            raise HTTPException(
                status_code=403, detail="Seu usuário não tem acesso a este sistema."
            )
        return

    for modulo, papel_minimo in pares:
        papel_usuario = papeis.get(f"{SISTEMA}.{modulo}")
        if papel_usuario is not None and _papel_atende(papel_usuario, papel_minimo):
            return

    modulo, papel_minimo = pares[0]
    papel_usuario = papeis.get(f"{SISTEMA}.{modulo}")
    if papel_usuario is None:
        raise HTTPException(status_code=403, detail=f"Seu usuário não tem papel em {modulo}.")
    raise HTTPException(
        status_code=403,
        detail=(
            f"Seu papel em {modulo} ({papel_usuario}) não é suficiente "
            f"(mínimo: {papel_minimo})."
        ),
    )


def _validar(modulo: str, papel_minimo: str) -> tuple[str, str]:
    if modulo not in _MODULOS_VALIDOS:
        raise ValueError(f"modulo desconhecido: {modulo!r} (válidos: {sorted(_MODULOS_VALIDOS)})")
    if papel_minimo not in _PAPEIS_VALIDOS:
        raise ValueError(
            f"papel_minimo desconhecido: {papel_minimo!r} (válidos: {sorted(_PAPEIS_VALIDOS)})"
        )
    return modulo, papel_minimo


def _dependency(pares: tuple[tuple[str, str], ...] | None):
    """Corpo único das duas factories. `pares is None` = só sessão."""
    def _checar(
        credentials: HTTPAuthorizationCredentials | None = Depends(_security),
        contatools_token: str | None = Cookie(default=None, alias=COOKIE_NOME),
    ) -> None:
        if not _jwt_segredo:
            return  # modo local/dev, convenção do ecossistema
        _checar_credencial(_bruto(credentials, contatools_token), pares)
    return _checar


def exigir(modulo: str, papel_minimo: str):
    """Dependency factory: `Depends(exigir("conciliacao", "operador"))`. Valida na montagem."""
    return _dependency((_validar(modulo, papel_minimo),))


def exigir_sessao():
    """Dependency das telas: qualquer papel neste sistema serve."""
    return _dependency(None)


def papeis_do_pedido(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    contatools_token: str | None = Cookie(default=None, alias=COOKIE_NOME),
) -> dict[str, str]:
    """Papéis do usuário em todos os sistemas: o menu usa para esconder o que a pessoa não abre."""
    if not _jwt_segredo:
        return {}
    bruto = _bruto(credentials, contatools_token)
    if bruto is None:
        return {}
    papeis = (verificar_token_assinado(bruto, _jwt_segredo) or {}).get("papeis", {})
    if not isinstance(papeis, dict):
        return {}
    return {k: v for k, v in papeis.items() if isinstance(v, str)}


def quem_do_pedido(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    contatools_token: str | None = Cookie(default=None, alias=COOKIE_NOME),
) -> str:
    """Nome de quem fez o pedido, para o registro da importação. Modo dev: "local"."""
    if not _jwt_segredo:
        return "local"
    bruto = _bruto(credentials, contatools_token)
    payload = (verificar_token_assinado(bruto, _jwt_segredo) if bruto else None) or {}
    return str(
        payload.get("nome") or payload.get("email") or payload.get("usuario_id") or "desconhecido"
    )
