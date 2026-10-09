"""Leitura dos arquivos reais da Brasil Reverso (jan a jul/2026). Números conferidos em 2026-10-09.

Roda só onde os arquivos de cliente existem (fora do git)."""

from pathlib import Path

import pytest

EX = Path(__file__).resolve().parents[1] / "examples"
RAZAO, BALANCETE, PLANO = (
    EX / f"{n} - BRASIL REVERSO 2026.xls" for n in ("RAZAO", "BALANCETE", "PLANO DE CONTAS")
)

pytestmark = pytest.mark.skipif(not RAZAO.exists(), reason="arquivos de cliente ausentes (fora do git)")


def test_razao_real():
    from conta_tools_contabil.igc.razao import ler_razao

    r = ler_razao(RAZAO.read_bytes())
    assert len(r.contas) == 350
    assert sum(len(c.lancamentos) for c in r.contas) == 15289
    assert r.codigo_igc == "43"


def test_balancete_real():
    from conta_tools_contabil.igc.balancete import ler_balancete

    b = ler_balancete(BALANCETE.read_bytes())
    assert len(b.linhas) == 378
    assert b.cnpj == "07213542000191"
    assert (b.mes_inicio, b.mes_fim) == ("2026-01", "2026-07")


def test_plano_real():
    from conta_tools_contabil.igc.plano import ler_plano

    p = ler_plano(PLANO.read_bytes())
    assert sum(1 for c in p.contas if c.reduzido) == 1666
    assert any("ALUGUÉIS" in c.descricao for c in p.contas)
