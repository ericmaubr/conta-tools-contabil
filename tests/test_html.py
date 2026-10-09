from decimal import Decimal

import pytest
from igc_fixtures import tabela_html

from conta_tools_contabil.igc.html import (
    ArquivoInvalido,
    ler_tabela,
    normalizar_cnpj,
    numero_br,
    saldo_dc,
)


def test_ler_tabela_devolve_texto_das_celulas_com_acento():
    conteudo = tabela_html([["Conta: 1", "Red.: 1-9  CAIXA"], ["ALUGUÉIS", "APLICAÇÕES"]])
    assert ler_tabela(conteudo) == [["Conta: 1", "Red.: 1-9 CAIXA"], ["ALUGUÉIS", "APLICAÇÕES"]]


def test_ler_tabela_nao_le_como_utf8():
    # 0xC9 é "É" em cp1252 e byte inválido em UTF-8
    assert ler_tabela(tabela_html([["CRÉDITO"]])) == [["CRÉDITO"]]


@pytest.mark.parametrize(
    "texto, esperado",
    [("1.234,56", "1234.56"), ("0,00", "0"), ("-2.875.157,33", "-2875157.33"), ("", "0"),
     ("92.677.358,31", "92677358.31"), ("12,33", "12.33")],
)
def test_numero_br(texto, esperado):
    assert numero_br(texto) == Decimal(esperado)


@pytest.mark.parametrize("texto", ["1234.56", "1.234,5", "abc", "1,234.56", "12"])
def test_numero_br_recusa_formato_inesperado(texto):
    with pytest.raises(ArquivoInvalido, match="1.234,56"):
        numero_br(texto)


@pytest.mark.parametrize(
    "texto, esperado",
    [("28.581,14 D", "28581.14"), ("2.875.157,33 C", "-2875157.33"), ("0,00", "0")],
)
def test_saldo_dc(texto, esperado):
    assert saldo_dc(texto) == Decimal(esperado)


def test_saldo_dc_recusa_saldo_sem_lado():
    with pytest.raises(ArquivoInvalido, match="D/C"):
        saldo_dc("1.234,56")


def test_normalizar_cnpj_mantem_letras():
    assert normalizar_cnpj("07.213.542/0001-91") == "07213542000191"
    assert normalizar_cnpj("12.ABC.345/01DE-35") == "12ABC34501DE35"
    assert normalizar_cnpj("") == ""
