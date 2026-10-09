from decimal import Decimal

import pytest
from igc_fixtures import tabela_html

from conta_tools_contabil.igc.balancete import ler_balancete
from conta_tools_contabil.igc.html import ArquivoInvalido

D = Decimal


def _balancete(*linhas, periodo="01/2026 a 07/2026"):
    return tabela_html([
        ["CNPJ: 07.213.542/0001-91", "", "", "", "", "Página:", "", "1"],
        ["Contabilidade", "", "Balancete de Verificação", "", "", "Emissão:", "", "08/10/2026"],
        ["Consolidação: Empresa", "", "Grau: 5", "", "Período:", periodo, "", ""],
        ["Conta", "Reduzida", "Descrição", "", "Saldo Anterior", "Débito", "Crédito", "Saldo Atual"],
        ["1", "", "ATIVO", "", "28.581,14 D", "1.341,30", "10.614,14", "19.308,30 D"],
        *linhas,
        ["", "", "TOTAL GERAL", "", "0,00", "1.341,30", "1.341,30", "0,00"],
    ])


def test_le_cabecalho_e_so_linhas_analiticas():
    b = ler_balancete(_balancete(
        ["1.1.1.01.0001", "1-9", "CAIXA", "", "28.581,14 D", "1.341,30", "10.614,14", "19.308,30 D"],
        ["2.1.1.01.0445", "121-0", "VIANA", "", "100,00 C", "0,00", "0,00", "100,00 C"],
    ))
    assert b.cnpj == "07213542000191"
    assert (b.mes_inicio, b.mes_fim) == ("2026-01", "2026-07")
    assert [x.reduzido for x in b.linhas] == ["1-9", "121-0"]
    assert b.linhas[0].saldo_anterior == D("28581.14")
    assert b.linhas[1].saldo_atual == D("-100.00")
    assert (b.total_debito, b.total_credito) == (D("1341.30"), D("1341.30"))


def test_recusa_sem_periodo():
    with pytest.raises(ArquivoInvalido, match="Período"):
        ler_balancete(_balancete(periodo="julho"))


def test_recusa_razao_no_campo_do_balancete():
    razao = tabela_html([
        ["43 - ACME LTDA", "", "", "", "", "", "Página:", "1"],
        ["Consolidação: Empresa", "", "", "", "", "", "", "Período: 01/01/2026 a 31/07/2026"],
    ])
    with pytest.raises(ArquivoInvalido, match="balancete"):
        ler_balancete(razao)
