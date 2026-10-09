import asyncio
import threading

from fastapi.testclient import TestClient
from helpers_app import app_de_teste
from test_gravar import FEV, JAN, _arquivos


def _post(client, arquivos, ini="2026-01", fim="2026-02"):
    razao, balancete, plano = arquivos
    return client.post("/importacoes", data={"mes_inicio": ini, "mes_fim": fim}, files={
        "razao": ("razao.xls", razao), "balancete": ("balancete.xls", balancete),
        "plano": ("plano.xls", plano),
    })


def test_version_e_status():
    c = TestClient(app_de_teste())
    assert c.get("/version").json()["version"]
    s = c.get("/status").json()
    assert s["alive"] is True and s["banco_ok"] is True and s["auth_ligada"] is False


def test_importacao_aceita_aparece_na_lista():
    c = TestClient(app_de_teste())
    r = _post(c, _arquivos(JAN + FEV))
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["aceita"] is True and corpo["lancamentos"] == 6 and corpo["divergencias"] == []
    [linha] = c.get("/importacoes").json()
    assert (linha["status"], linha["quem"], linha["cnpj"]) == ("aceita", "local", "07213542000191")


def test_importacao_recusada_devolve_divergencias():
    c = TestClient(app_de_teste())
    corpo = _post(c, _arquivos(JAN + FEV), ini="2026-02").json()
    assert corpo["aceita"] is False
    assert corpo["divergencias"][0]["conferencia"] == "periodo"


def test_arquivo_trocado_e_mes_invalido_viram_422():
    c = TestClient(app_de_teste())
    razao, balancete, plano = _arquivos(JAN + FEV)
    r = _post(c, (balancete, balancete, plano))
    assert r.status_code == 422 and "razão" in r.json()["detail"]
    assert _post(c, _arquivos(JAN + FEV), ini="01/2026").status_code == 422


def test_importacao_roda_fora_da_thread_do_event_loop(monkeypatch):
    """Convenção do ecossistema: handler async não chama trabalho síncrono pesado direto
    (importação de 17 MB). TestClient não serve para isto: chama a corrotina direto."""
    from conta_tools_contabil.api import app as app_mod
    from conta_tools_contabil.importacao.gravar import ResultadoImportacao

    thread_do_loop = threading.current_thread()
    usadas = []

    def _falso(*a, **k):
        usadas.append(threading.current_thread())
        return ResultadoImportacao("x", True, [], "1", "E", 0, 0)

    monkeypatch.setattr(app_mod, "importar", _falso)
    app = app_de_teste()
    handler = next(
        r.endpoint for r in app.routes
        if getattr(r, "path", "") == "/importacoes" and "POST" in r.methods
    )

    class _Arq:
        filename = "x.xls"

        async def read(self):
            return b""

    asyncio.run(handler(razao=_Arq(), balancete=_Arq(), plano=_Arq(),
                        mes_inicio="2026-01", mes_fim="2026-01", quem="t"))
    assert usadas and usadas[0] is not thread_do_loop


def test_tela_de_importacao_carrega_nav_e_nao_tem_cinza():
    c = TestClient(app_de_teste())
    html = c.get("/").text
    assert '<script src="nav.js"></script>' in html and "montarNavLinks('importacao')" in html
    for cinza in ("#888", "#999", "#666", "#777", "gray", "grey"):
        assert cinza not in html.lower()
    assert c.get("/nav.js").status_code == 200


def test_conflito_de_gravacao_vira_409_com_mensagem(monkeypatch):
    from sqlalchemy.exc import IntegrityError

    from conta_tools_contabil.api import app as app_mod

    def _conflito(*a, **k):
        raise IntegrityError("insert", {}, Exception("UNIQUE constraint failed"))

    monkeypatch.setattr(app_mod, "importar", _conflito)
    r = _post(TestClient(app_de_teste()), _arquivos(JAN + FEV))
    assert r.status_code == 409 and "tente de novo" in r.json()["detail"]


def test_tela_mostra_erro_que_nao_vem_em_json():
    """Revisão final, achado 3: 500/413/502 do Caddy vêm em texto e a tela ficava muda."""
    html = TestClient(app_de_teste()).get("/").text
    assert "catch" in html and "HTTP ${resp.status}" in html
