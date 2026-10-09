"""Meses no formato "AAAA-MM": a gravação é por mês."""

from __future__ import annotations

import calendar
import re
from datetime import date


def validar_mes(texto: str) -> str:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", texto or ""):
        raise ValueError(f"mês fora do formato AAAA-MM: {texto!r}")
    return texto


def _ano_mes(mes: str) -> tuple[int, int]:
    validar_mes(mes)
    return int(mes[:4]), int(mes[5:])


def meses_do_periodo(inicio: str, fim: str) -> list[str]:
    a, m = _ano_mes(inicio)
    if _ano_mes(fim) < (a, m):
        raise ValueError(f"mês final {fim} antes do inicial {inicio}")
    meses = []
    while f"{a:04d}-{m:02d}" <= fim:
        meses.append(f"{a:04d}-{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return meses


def mes_anterior(mes: str) -> str:
    a, m = _ano_mes(mes)
    return f"{a - 1:04d}-12" if m == 1 else f"{a:04d}-{m - 1:02d}"


def primeiro_dia(mes: str) -> date:
    a, m = _ano_mes(mes)
    return date(a, m, 1)


def ultimo_dia(mes: str) -> date:
    a, m = _ano_mes(mes)
    return date(a, m, calendar.monthrange(a, m)[1])
