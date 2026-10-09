"""Balancete de verificação exportado do IGC."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from conta_tools_contabil.igc.html import (
    ArquivoInvalido,
    ler_tabela,
    normalizar_cnpj,
    numero_br,
    saldo_dc,
)
from conta_tools_contabil.igc.plano import REDUZIDO


@dataclass(frozen=True)
class LinhaBalancete:
    classificacao: str
    reduzido: str
    descricao: str
    saldo_anterior: Decimal  # D − C
    debito: Decimal
    credito: Decimal
    saldo_atual: Decimal  # D − C


@dataclass
class Balancete:
    cnpj: str
    mes_inicio: str  # "AAAA-MM"
    mes_fim: str
    linhas: list[LinhaBalancete]  # só analíticas (com reduzido)
    total_debito: Decimal  # linha TOTAL GERAL
    total_credito: Decimal


def ler_balancete(conteudo: bytes) -> Balancete:
    linhas = ler_tabela(conteudo)
    celulas = [c for linha in linhas[:12] for c in linha if c]
    cnpj = next((normalizar_cnpj(c[5:]) for c in celulas if c.startswith("CNPJ:")), "")
    if not cnpj:
        raise ArquivoInvalido("não parece um balancete do IGC: falta 'CNPJ:' no cabeçalho")
    periodo = next(
        (celulas[i + 1] for i, c in enumerate(celulas) if c == "Período:" and i + 1 < len(celulas)),
        "",
    )
    m = re.fullmatch(r"(\d\d)/(\d{4}) a (\d\d)/(\d{4})", periodo)
    if not m:
        raise ArquivoInvalido(
            f"balancete sem 'Período: mm/aaaa a mm/aaaa' no cabeçalho (achei {periodo!r})"
        )
    total = next((x for x in linhas if len(x) >= 8 and x[2] == "TOTAL GERAL"), None)
    if total is None:
        raise ArquivoInvalido("balancete sem a linha TOTAL GERAL")
    analiticas = [
        LinhaBalancete(
            x[0], x[1], x[2], saldo_dc(x[4]), numero_br(x[5]), numero_br(x[6]), saldo_dc(x[7])
        )
        for x in linhas
        if len(x) >= 8 and REDUZIDO.fullmatch(x[1])
    ]
    return Balancete(
        cnpj=cnpj,
        mes_inicio=f"{m[2]}-{m[1]}",
        mes_fim=f"{m[4]}-{m[3]}",
        linhas=analiticas,
        total_debito=numero_br(total[5]),
        total_credito=numero_br(total[6]),
    )
