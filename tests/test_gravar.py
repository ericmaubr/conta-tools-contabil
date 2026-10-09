import json
from decimal import Decimal

import pytest
from igc_fixtures import tabela_html
from sqlalchemy import func, select

from conta_tools_contabil import db
from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.importacao.gravar import importar

D = Decimal
VAZIA = [""] * 8


def _br(v):
    return f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _lado(v):
    return f"{_br(v)} {'D' if v >= 0 else 'C'}"


def _bloco(conta, reduzido, nome, ant, lancs, contrapartida):
    """Bloco de uma conta no razão, com o saldo impresso acumulado (D − C) em cada linha."""
    saldo, linhas = ant, []
    for data, d, c, lote in lancs:
        saldo = saldo + d - c
        linhas.append([data, "H", "", contrapartida, lote, _br(d) if d else "", _br(c) if c else "", _br(saldo)])
    deb = sum((x[1] for x in lancs), D("0"))
    cred = sum((x[2] for x in lancs), D("0"))
    return [[f"Conta: {conta}", f"Red.: {reduzido} {nome}", "", "", "", "", "Saldo Anterior:", _br(ant)], VAZIA,
            *linhas, ["", "", "", "", "Total da Conta:", _br(deb), _br(cred), _br(saldo)]], deb, cred, saldo


def _arquivos(lancs_caixa, *, ini="01/2026", fim="02/2026", dfim="28/02/2026", ant=D("100"), nome="ACME LTDA"):
    """CAIXA (1-9) com os lançamentos [(data, débito, crédito, lote)], espelhados na CONTRAPARTIDA (9-1);
    IMOVEIS (3-5) só no balancete, sem movimento, com saldo credor igual ao do CAIXA no início."""
    espelho = [(data, c, d, "C" + lote) for data, d, c, lote in lancs_caixa]
    b1, d1, c1, s1 = _bloco("111", "1-9", "CAIXA", ant, lancs_caixa, "9-1")
    b2, d2, c2, s2 = _bloco("999", "9-1", "CONTRAPARTIDA", D("0"), espelho, "1-9")
    razao = tabela_html([
        [f"43 - {nome}", "", "", "", "", "", "Página:", "1"],
        ["Consolidação: Empresa", "", "", "", "", "", "", f"Período: 01/{ini} a {dfim}"],
        *b1, *b2,
    ])
    balancete = tabela_html([
        ["CNPJ: 07.213.542/0001-91"],
        ["Consolidação: Empresa", "Período:", f"{ini} a {fim}"],
        ["1.1", "1-9", "CAIXA", "", _lado(ant), _br(d1), _br(c1), _lado(s1)],
        ["1.2", "3-5", "IMOVEIS", "", _lado(-ant), "0,00", "0,00", _lado(-ant)],
        ["9.9", "9-1", "CONTRAPARTIDA", "", "0,00", _br(d2), _br(c2), _lado(s2)],
        ["", "", "TOTAL GERAL", "", "0,00", _br(d1 + d2), _br(c1 + c2), "0,00"],
    ])
    plano = tabela_html([
        [nome], ["Classificação", "Código", "Descrição", "CNPJ Cliente/Fornecedor", "Grau", "Tipo"],
        ["1.1", "1-9", "CAIXA", "", "5", ""], ["1.2", "3-5", "IMOVEIS", "", "5", ""],
        ["9.9", "9-1", "CONTRAPARTIDA", "", "5", ""],
    ])
    return razao, balancete, plano


JAN = [("05/01/2026", D("50"), D("0"), "1/1"), ("20/01/2026", D("0"), D("10"), "1/2")]
FEV = [("03/02/2026", D("0"), D("20"), "1/3")]


@pytest.fixture
def engine():
    db.set_database_url("sqlite:///:memory:")
    e = db.get_engine()
    db.criar_schema(e)
    return e


def _contar(engine, tabela):
    with engine.connect() as c:
        return c.execute(select(func.count()).select_from(tabela)).scalar()


def _importar(engine, arquivos, ini="2026-01", fim="2026-02"):
    razao, balancete, plano = arquivos
    return importar(engine, razao=razao, balancete=balancete, plano=plano, mes_inicio=ini, mes_fim=fim, quem="ana")


def test_importacao_aceita_grava_meses_e_lancamentos(engine):
    r = _importar(engine, _arquivos(JAN + FEV))
    assert r.aceita and r.divergencias == []
    assert (r.cnpj, r.contas, r.lancamentos) == ("07213542000191", 3, 6)
    with engine.connect() as c:
        cm = {(x.reduzido, x.mes): x for x in c.execute(select(db.conta_mes))}
    assert len(cm) == 6  # 3 contas x 2 meses
    assert cm["1-9", "2026-01"].saldo_final == D("140")
    assert cm["1-9", "2026-02"].saldo_anterior == D("140")
    assert cm["1-9", "2026-02"].saldo_final == D("120")
    assert _contar(engine, db.lancamento) == 6
    assert _contar(engine, db.plano_conta) == 3


def test_importacao_recusada_nao_grava_dado(engine):
    r = _importar(engine, _arquivos(JAN + FEV), ini="2026-02")  # período errado
    assert not r.aceita
    assert {d.conferencia for d in r.divergencias} == {"periodo"}
    assert _contar(engine, db.importacao) == 1
    assert _contar(engine, db.conta_mes) == _contar(engine, db.lancamento) == _contar(engine, db.plano_conta) == 0
    with engine.connect() as c:
        linha = c.execute(select(db.importacao)).one()
    assert linha.status == "recusada"
    assert json.loads(linha.divergencias)[0]["conferencia"] == "periodo"


def test_reimportar_apaga_o_que_sumiu_e_mantem_identidade(engine):
    _importar(engine, _arquivos(JAN + FEV))
    r = _importar(engine, _arquivos(JAN[:1] + FEV))  # o 1/2 de janeiro sumiu do IGC
    assert r.aceita
    with engine.connect() as c:
        lotes = {x.lote_lcto for x in c.execute(select(db.lancamento).where(db.lancamento.c.reduzido == "1-9"))}
        cm = c.execute(select(db.conta_mes).where(db.conta_mes.c.reduzido == "1-9", db.conta_mes.c.mes == "2026-01")).one()
    assert lotes == {"1/1", "1/3"}
    assert cm.saldo_final == D("150")
    assert _contar(engine, db.conta_mes) == 6  # substituído, não duplicado


def test_mes_seguinte_confere_saldo_anterior_com_o_gravado(engine):
    _importar(engine, _arquivos(JAN, fim="01/2026", dfim="31/01/2026"), fim="2026-01")
    # março começa com saldo 999, mas fevereiro não foi importado:
    # não há mês anterior gravado para março -> aceita
    marco = [("03/03/2026", D("0"), D("20"), "1/9")]
    ok = _importar(engine, _arquivos(marco, ini="03/2026", fim="03/2026", dfim="31/03/2026", ant=D("999")), "2026-03", "2026-03")
    assert ok.aceita
    # fevereiro começa com 999, mas janeiro gravado terminou em 140 -> recusa
    fev = [("03/02/2026", D("0"), D("20"), "1/3")]
    r = _importar(engine, _arquivos(fev, ini="02/2026", fim="02/2026", dfim="28/02/2026", ant=D("999")), "2026-02", "2026-02")
    assert not r.aceita
    assert {d.conferencia for d in r.divergencias} == {"saldo_anterior"}


def test_arquivo_trocado_levanta_dizendo_qual(engine):
    razao, balancete, plano = _arquivos(JAN + FEV)
    with pytest.raises(ArquivoInvalido, match="razão"):
        importar(engine, razao=balancete, balancete=balancete, plano=plano, mes_inicio="2026-01", mes_fim="2026-02", quem="ana")
