"""Varredura de auth em TODA rota (convenção do ecossistema: cobre rota nova sozinha)."""

from conta_tools_shared.auth.cookie import COOKIE_NOME
from conta_tools_shared.auth.token import emitir
from conta_tools_shared.testing import assert_rotas_protegidas, assert_tela_exige_sessao
from fastapi.testclient import TestClient
from helpers_app import app_de_teste

_ISENTAS = {"/version", "/status", "/nav.js"}
SEGREDO = "segredo-de-teste"


def _token(papeis):
    return emitir({"usuario_id": 1, "papeis": papeis, "versao": 1, "nome": "Ana"}, SEGREDO, ttl_segundos=600)


def test_isentas_sao_exatamente_estas():
    """Crescer a lista exige editar este contrato: uma linha a mais desliga a guarda da rota."""
    assert _ISENTAS == {"/version", "/status", "/nav.js"}


def test_todas_rotas_autenticadas_rejeitam_sem_token():
    # /me/papeis devolve {} sem credencial por contrato (o menu distingue "sem papel" de erro)
    assert_rotas_protegidas(app_de_teste(segredo=SEGREDO), isentas=_ISENTAS | {"/me/papeis"})


def test_tela_exige_sessao():
    tok = _token({"conta-tools-outro.x": "leitura"})
    assert_tela_exige_sessao(
        app_de_teste(segredo=SEGREDO, root_path="/prefixo"), "/",
        {"Authorization": f"Bearer {tok}"}, cookies_sem_papel={COOKIE_NOME: tok},
    )


def test_leitura_nao_importa_e_operador_importa():
    from test_api import _post
    from test_gravar import FEV, JAN, _arquivos

    app = app_de_teste(segredo=SEGREDO)
    leitor = TestClient(app, headers={"Authorization": f"Bearer {_token({'conta-tools-contabil.conciliacao': 'leitura'})}"})
    assert leitor.get("/importacoes").status_code == 200
    assert _post(leitor, _arquivos(JAN + FEV)).status_code == 403
    operador = TestClient(app, headers={"Authorization": f"Bearer {_token({'conta-tools-contabil.conciliacao': 'operador'})}"})
    assert _post(operador, _arquivos(JAN + FEV)).json()["aceita"] is True
    assert operador.get("/importacoes").json()[0]["quem"] == "Ana"
