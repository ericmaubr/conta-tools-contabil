"""Plano de contas exportado do IGC ("Listagem do Plano de Contas")."""

from __future__ import annotations

import re
from dataclasses import dataclass

from conta_tools_contabil.igc.html import ArquivoInvalido, ler_tabela, normalizar_cnpj

CLASSIFICACAO = re.compile(r"\d+(\.\d+)*")
REDUZIDO = re.compile(r"\d+-\d")


@dataclass(frozen=True)
class ContaPlano:
    classificacao: str
    reduzido: str  # "" nas sintéticas
    descricao: str
    cnpj: str  # normalizado; "" quando não tem
    grau: int


@dataclass
class Plano:
    empresa_nome: str
    contas: list[ContaPlano]


def ler_plano(conteudo: bytes) -> Plano:
    linhas = ler_tabela(conteudo)
    if not any(linha[:3] == ["Classificação", "Código", "Descrição"] for linha in linhas):
        raise ArquivoInvalido(
            "não parece um plano de contas do IGC: falta o cabeçalho Classificação/Código/Descrição"
        )
    contas = []
    for linha in linhas:
        if len(linha) < 5 or not CLASSIFICACAO.fullmatch(linha[0]):
            continue
        reduzido = linha[1]
        if reduzido and not REDUZIDO.fullmatch(reduzido):
            raise ArquivoInvalido(
                f"plano: reduzido fora do formato 123-4 em {linha[0]}: {reduzido!r}"
            )
        grau = int(linha[4]) if linha[4].isdigit() else 0
        contas.append(ContaPlano(linha[0], reduzido, linha[2], normalizar_cnpj(linha[3]), grau))
    if not any(c.reduzido for c in contas):
        raise ArquivoInvalido("plano de contas sem nenhuma conta analítica (com código reduzido)")
    return Plano(empresa_nome=linhas[0][0] if linhas and linhas[0] else "", contas=contas)
