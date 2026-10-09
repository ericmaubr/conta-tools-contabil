"""Razão analítico exportado do IGC: blocos por conta.

Formato (conferido em 2026-10-09 no razão real): toda linha tem 8 células.
Abertura: ["Conta: 111010001", "Red.: 1-9 CAIXA", "", "", "", "", "Saldo Anterior:", "28.581,14"].
Lançamento: [data, histórico, "", CP, lote/lcto, débito, crédito, saldo].
Fechamento: ["", "", "", "", "Total da Conta:", débito, crédito, saldo].
O saldo impresso tem o sinal da natureza da conta; quem precisa do D − C usa o balancete."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from conta_tools_contabil.igc.html import ArquivoInvalido, ler_tabela, numero_br

_DATA = re.compile(r"\d\d/\d\d/\d{4}")
_PERIODO = re.compile(r"Período: (\d\d/\d\d/\d{4}) a (\d\d/\d\d/\d{4})")


@dataclass(frozen=True)
class LancamentoRazao:
    data: date
    historico: str
    contrapartida: str  # reduzido, "-" (sem contrapartida) ou ""
    lote_lcto: str
    debito: Decimal
    credito: Decimal
    saldo_impresso: Decimal


@dataclass
class ContaRazao:
    conta: str
    reduzido: str
    nome: str
    saldo_anterior_impresso: Decimal
    lancamentos: list[LancamentoRazao] = field(default_factory=list)
    total_debito: Decimal | None = None
    total_credito: Decimal | None = None


@dataclass
class Razao:
    codigo_igc: str
    empresa_nome: str
    inicio: date
    fim: date
    contas: list[ContaRazao]


def _data(texto: str) -> date:
    try:
        return datetime.strptime(texto, "%d/%m/%Y").date()
    except ValueError as e:  # ex.: 31/02/2026 passa na regex e não existe
        raise ArquivoInvalido(f"razão: data inválida {texto!r}") from e


def ler_razao(conteudo: bytes) -> Razao:
    linhas = ler_tabela(conteudo)
    celulas = [c for linha in linhas[:12] for c in linha if c]
    periodo = next((m for c in celulas if (m := _PERIODO.fullmatch(c))), None)
    empresa = re.fullmatch(r"(\d+) - (.+)", linhas[0][0]) if linhas and linhas[0] else None
    if not periodo or not empresa:
        raise ArquivoInvalido(
            "não parece um razão do IGC: falta '<código> - <empresa>' ou "
            "'Período: dd/mm/aaaa a dd/mm/aaaa'"
        )
    contas: list[ContaRazao] = []
    atual: ContaRazao | None = None
    for linha in linhas:
        if len(linha) < 8:
            continue
        if linha[0].startswith("Conta:"):
            m = re.fullmatch(r"Red\.:\s*(\S+)\s+(.*)", linha[1])
            if not m:
                raise ArquivoInvalido(
                    f"razão: abertura de conta sem 'Red.: <reduzido> <nome>': {linha[1]!r}"
                )
            atual = ContaRazao(
                conta=linha[0].split(":", 1)[1].strip(),
                reduzido=m[1],
                nome=m[2],
                saldo_anterior_impresso=numero_br(linha[7]),
            )
            contas.append(atual)
        elif _DATA.fullmatch(linha[0]):
            if atual is None:
                raise ArquivoInvalido("razão: lançamento antes de qualquer 'Conta:'")
            atual.lancamentos.append(LancamentoRazao(
                data=_data(linha[0]), historico=linha[1], contrapartida=linha[3],
                lote_lcto=linha[4], debito=numero_br(linha[5]), credito=numero_br(linha[6]),
                saldo_impresso=numero_br(linha[7]),
            ))
        elif linha[4] == "Total da Conta:" and atual is not None:
            atual.total_debito, atual.total_credito = numero_br(linha[5]), numero_br(linha[6])
    return Razao(
        codigo_igc=empresa[1], empresa_nome=empresa[2],
        inicio=_data(periodo[1]), fim=_data(periodo[2]), contas=contas,
    )
