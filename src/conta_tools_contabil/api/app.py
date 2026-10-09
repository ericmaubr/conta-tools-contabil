"""API HTTP do conta-tools-contabil."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from conta_tools_shared.auth.tela import instalar_redirect_de_tela
from conta_tools_shared.seguranca import adicionar_headers_seguranca
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from starlette.middleware.gzip import GZipMiddleware

from conta_tools_contabil import autorizacao, db
from conta_tools_contabil.conf import ApiConf
from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.importacao.gravar import importar

_STATIC = Path(__file__).parent / "static"
_PACOTE = "conta-tools-contabil"

_SEM_ACESSO_HTML = """<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<title>Sem acesso: Conciliação contábil</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;
padding:0 1rem;color:#1f2430">
<h1>Você não tem acesso a este sistema</h1>
<p>Sua sessão é válida, mas seu usuário não tem papel em <code>conta-tools-contabil</code>.
Peça a quem administra os acessos o papel <code>conciliacao:leitura</code> (ver) ou
<code>conciliacao:operador</code> (importar e conciliar).</p>
</body></html>
"""


def create_app(api_conf: ApiConf) -> FastAPI:
    autorizacao.configurar(jwt_segredo=api_conf.auth_jwt_segredo)
    engine = db.get_engine()
    from conta_tools_shared.migracao import avisar_migracao_pendente

    migracao_pendente = avisar_migracao_pendente(
        "conta_tools_contabil", engine, "python -m conta_tools_contabil migrar"
    )

    app = FastAPI(title="ContaTools Contábil", docs_url=None, redoc_url=None, openapi_url=None)
    adicionar_headers_seguranca(app)
    app.add_middleware(GZipMiddleware, minimum_size=500)

    def _dep(modulo: str, papel: str):
        return [Depends(autorizacao.exigir(modulo, papel))]

    _SESSAO = [Depends(autorizacao.exigir_sessao())]

    @app.get("/version", include_in_schema=False)
    def get_version():
        from importlib.metadata import version as pkg_version
        return {"version": pkg_version(_PACOTE)}

    @app.get("/status", include_in_schema=False)
    def get_status(request: Request):
        from conta_tools_shared.status import build_status

        # toca o recurso real: banco fora do ar tem que aparecer no monitor
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            banco_ok, erro = True, None
        except Exception as e:  # noqa: BLE001
            banco_ok, erro = False, f"banco indisponível: {e.__class__.__name__}"
        return {
            **build_status(
                last_run_ok=None if banco_ok else False, last_error=erro, pacote=_PACOTE
            ),
            "banco_ok": banco_ok,
            "migracao_pendente": migracao_pendente,
            "auth_ligada": autorizacao.esta_ligada(),
            "root_path": request.scope.get("root_path", ""),
        }

    @app.get("/me/papeis", include_in_schema=False)
    def me_papeis(papeis: dict = Depends(autorizacao.papeis_do_pedido)):
        return papeis

    @app.get("/nav.js", include_in_schema=False)
    def nav_js():
        return Response(
            (_STATIC / "nav.js").read_text(encoding="utf-8"), media_type="application/javascript"
        )

    @app.get("/", response_class=HTMLResponse, include_in_schema=False, dependencies=_SESSAO)
    def tela_importacao():
        return HTMLResponse((_STATIC / "importacao.html").read_text(encoding="utf-8"))

    @app.post("/importacoes", dependencies=_dep("conciliacao", "operador"))
    async def post_importacao(
        razao: UploadFile = File(...),
        balancete: UploadFile = File(...),
        plano: UploadFile = File(...),
        mes_inicio: str = Form(...),
        mes_fim: str = Form(...),
        quem: str = Depends(autorizacao.quem_do_pedido),
    ):
        conteudos = [await razao.read(), await balancete.read(), await plano.read()]
        try:
            # importação de 17 MB é pesada: fora do event loop (convenção do ecossistema)
            r = await asyncio.to_thread(
                importar, engine, razao=conteudos[0], balancete=conteudos[1], plano=conteudos[2],
                mes_inicio=mes_inicio, mes_fim=mes_fim, quem=quem,
            )
        except (ArquivoInvalido, ValueError) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return {
            "id": r.id, "aceita": r.aceita, "cnpj": r.cnpj, "empresa_nome": r.empresa_nome,
            "contas": r.contas, "lancamentos": r.lancamentos,
            "divergencias": [d.__dict__ for d in r.divergencias],
        }

    @app.get("/importacoes", dependencies=_dep("conciliacao", "leitura"))
    def get_importacoes():
        t = db.importacao
        fora = {"divergencias", "hash_razao", "hash_balancete", "hash_plano"}
        with engine.connect() as conn:
            linhas = conn.execute(
                select(t).order_by(t.c.criado_em.desc()).limit(200)
            ).mappings().all()
        return [
            {**{k: v for k, v in linha.items() if k not in fora},
             "divergencias": json.loads(linha["divergencias"])}
            for linha in linhas
        ]

    # depois de todas as rotas: varre app.routes no momento da chamada
    app.state.rotas_tela = instalar_redirect_de_tela(app, _SESSAO, sem_acesso_html=_SEM_ACESSO_HTML)
    return app
