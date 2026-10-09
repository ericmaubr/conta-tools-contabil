"""Leitura das exportações do IGC: HTML com extensão .xls, em cp1252.

Razão, balancete e plano são uma tabela HTML só, com o texto de cada célula dentro de
<font>/<b>. Este módulo devolve a tabela como lista de linhas de texto, sem interpretar nada:
cada leitor (razao.py, balancete.py, plano.py) sabe o que cada coluna significa."""

from __future__ import annotations

import re
from decimal import Decimal
from html.parser import HTMLParser


class ArquivoInvalido(ValueError):
    """O arquivo não é o relatório esperado. A mensagem diz qual e por quê."""


class _Tabela(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.linhas: list[list[str]] = []
        self._linha: list[str] | None = None
        self._celula: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._linha = []
        elif tag == "td" and self._linha is not None:
            self._celula = []

    def handle_endtag(self, tag):
        if tag == "td" and self._celula is not None and self._linha is not None:
            self._linha.append(" ".join("".join(self._celula).split()))
            self._celula = None
        elif tag == "tr" and self._linha is not None:
            self.linhas.append(self._linha)
            self._linha = None

    def handle_data(self, data):
        if self._celula is not None:
            self._celula.append(data)


def ler_tabela(conteudo: bytes) -> list[list[str]]:
    """Linhas da tabela, cada célula com os espaços normalizados.

    cp1252 e não UTF-8: ler como UTF-8 destrói os acentos (erro real do protótipo dos mockups).
    `errors="replace"` porque um arquivo errado (ex.: .xlsx binário) não pode estourar aqui: quem
    recusa é o leitor específico, com mensagem dizendo o que faltou."""
    parser = _Tabela()
    parser.feed(conteudo.decode("cp1252", errors="replace"))
    parser.close()
    return parser.linhas


_NUMERO = re.compile(r"-?\d{1,3}(\.\d{3})*,\d{2}")


def numero_br(texto: str) -> Decimal:
    """`"1.234,56"` -> `Decimal("1234.56")`; vazio -> 0.

    Qualquer outro formato levanta: um valor lido errado vira conciliação errada em silêncio."""
    t = texto.strip()
    if not t:
        return Decimal("0")
    if not _NUMERO.fullmatch(t):
        raise ArquivoInvalido(f"valor fora do formato 1.234,56: {texto!r}")
    return Decimal(t.replace(".", "").replace(",", "."))  # conversao-ok: validado por _NUMERO


def saldo_dc(texto: str) -> Decimal:
    """Saldo do balancete com o lado: `"1.234,56 D"` -> 1234.56, `"... C"` -> negativo (D − C).

    O IGC põe sinal de menos no saldo que está contra a natureza da conta ("-28,74 C" num ativo):
    o lado real é a letra, então o menos é ignorado. Usar os dois inverte o sinal (67 contas no
    balancete real da Brasil Reverso)."""
    m = re.fullmatch(r"(\S+)\s*([DC]?)", texto.strip())
    if not m:
        raise ArquivoInvalido(f"saldo fora do formato '1.234,56 D': {texto!r}")
    valor = abs(numero_br(m.group(1)))
    if valor and not m.group(2):
        raise ArquivoInvalido(f"saldo sem o lado D/C: {texto!r}")
    return -valor if m.group(2) == "C" else valor


def normalizar_cnpj(texto: str) -> str:
    """Só dígitos e letras, maiúsculas. Não usar `\\D`: o CNPJ alfanumérico tem letras."""
    return re.sub(r"[^0-9A-Za-z]", "", texto).upper()
