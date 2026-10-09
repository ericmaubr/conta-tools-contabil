import pytest
from igc_fixtures import tabela_html

from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.igc.plano import ContaPlano, ler_plano

CABECALHO = ["Classificação", "Código", "Descrição", "CNPJ Cliente/Fornecedor", "Grau", "Tipo"]


def _plano(*linhas):
    return tabela_html([
        ["ACME LTDA", "", "", "Página:", "1", ""],
        ["Contabilidade", "", "Listagem do Plano de Contas", "Data:", "08/10/2026", ""],
        CABECALHO,
        *linhas,
    ])


def test_le_sinteticas_e_analiticas():
    plano = ler_plano(_plano(
        ["1", "", "ATIVO", "", "1", ""],
        ["2.1.1.01.9657", "930-0", "POUSADA FRANLUA LTDA.", "26.410.105/0001-02", "5", ""],
    ))
    assert plano.empresa_nome == "ACME LTDA"
    assert plano.contas == [
        ContaPlano("1", "", "ATIVO", "", 1),
        ContaPlano("2.1.1.01.9657", "930-0", "POUSADA FRANLUA LTDA.", "26410105000102", 5),
    ]


def test_recusa_arquivo_que_nao_e_plano():
    with pytest.raises(ArquivoInvalido, match="plano de contas"):
        ler_plano(tabela_html([["CNPJ: 07.213.542/0001-91", "Página:"]]))


def test_recusa_reduzido_fora_do_formato():
    with pytest.raises(ArquivoInvalido, match="reduzido"):
        ler_plano(_plano(["1.1.1.01.0001", "19", "CAIXA", "", "5", ""]))
