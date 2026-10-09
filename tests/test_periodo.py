from datetime import date

import pytest

from conta_tools_contabil.importacao.periodo import (
    mes_anterior,
    meses_do_periodo,
    primeiro_dia,
    ultimo_dia,
    validar_mes,
)


def test_meses_do_periodo():
    assert meses_do_periodo("2025-11", "2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]
    assert meses_do_periodo("2026-07", "2026-07") == ["2026-07"]


def test_fim_antes_do_inicio():
    with pytest.raises(ValueError, match="antes"):
        meses_do_periodo("2026-07", "2026-01")


@pytest.mark.parametrize("texto", ["2026-7", "07/2026", "2026-13", ""])
def test_validar_mes_recusa(texto):
    with pytest.raises(ValueError):
        validar_mes(texto)


def test_dias_e_mes_anterior():
    assert mes_anterior("2026-01") == "2025-12"
    assert primeiro_dia("2026-02") == date(2026, 2, 1)
    assert ultimo_dia("2026-02") == date(2026, 2, 28)
