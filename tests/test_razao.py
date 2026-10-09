from datetime import date
from decimal import Decimal

import pytest
from igc_fixtures import tabela_html

from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.igc.razao import ler_razao

D = Decimal
VAZIA = ["", "", "", "", "", "", "", ""]


def _razao(*linhas):
    return tabela_html([
        ["43 - BRASIL REVERSO GERENCIAMENTO DE DESCARTA", "", "", "", "", "", "Página:", "1"],
        ["Contabilidade", "", "Razão Analítico", "", "", "", "Data:", "08/10/2026"],
        ["Consolidação: Empresa", "", "", "", "", "", "", "Período: 01/01/2026 a 31/07/2026"],
        ["Data", "Histórico", "", "CP", "Lote/Lcto.", "Débito", "Crédito", "Saldo"],
        *linhas,
    ])


def test_le_cabecalho_contas_lancamentos_e_totais():
    r = ler_razao(_razao(
        ["Conta: 111010001", "Red.: 1-9 CAIXA", "", "", "", "", "Saldo Anterior:", "28.581,14"],
        VAZIA,
        ["05/01/2026", "FERIAS DE FUNCIONARIOS", "", "35-3", "0/20489368", "", "7.215,28", "21.365,86"],
        ["06/01/2026", "Nota 1 - GOMAQ", "", "-", "0/20489974", "1.000,00", "", "22.365,86"],
        ["", "", "", "", "Total da Conta:", "1.000,00", "7.215,28", "22.365,86"],
    ))
    assert (r.codigo_igc, r.empresa_nome) == ("43", "BRASIL REVERSO GERENCIAMENTO DE DESCARTA")
    assert (r.inicio, r.fim) == (date(2026, 1, 1), date(2026, 7, 31))
    [c] = r.contas
    assert (c.conta, c.reduzido, c.nome) == ("111010001", "1-9", "CAIXA")
    assert c.saldo_anterior_impresso == D("28581.14")
    assert (c.total_debito, c.total_credito) == (D("1000.00"), D("7215.28"))
    l0, l1 = c.lancamentos
    assert (l0.data, l0.contrapartida, l0.lote_lcto) == (date(2026, 1, 5), "35-3", "0/20489368")
    assert (l0.debito, l0.credito, l0.saldo_impresso) == (D("0"), D("7215.28"), D("21365.86"))
    assert l1.contrapartida == "-"


def test_saldo_negativo_impresso():
    r = ler_razao(_razao(
        ["Conta: 246020001", "Red.: 1634-9 (-) DISTRIBUIÇÃO LUCROS", "", "", "", "",
         "Saldo Anterior:", "-2.875.157,33"],
    ))
    assert r.contas[0].saldo_anterior_impresso == D("-2875157.33")
    assert r.contas[0].nome == "(-) DISTRIBUIÇÃO LUCROS"


def test_recusa_lancamento_antes_de_qualquer_conta():
    with pytest.raises(ArquivoInvalido, match="antes"):
        ler_razao(_razao(["05/01/2026", "X", "", "-", "0/1", "1,00", "", "1,00"]))


def test_recusa_arquivo_que_nao_e_razao():
    with pytest.raises(ArquivoInvalido, match="razão"):
        ler_razao(tabela_html([["CNPJ: 07.213.542/0001-91"], ["Período:", "01/2026 a 07/2026"]]))


def test_recusa_data_impossivel():
    with pytest.raises(ArquivoInvalido, match="31/02/2026"):
        ler_razao(_razao(
            ["Conta: 111010001", "Red.: 1-9 CAIXA", "", "", "", "", "Saldo Anterior:", "0,00"],
            ["31/02/2026", "X", "", "-", "0/1", "1,00", "", "1,00"],
        ))
