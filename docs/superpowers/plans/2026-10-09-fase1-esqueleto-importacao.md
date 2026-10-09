# Fase 1: esqueleto do serviço e importação do IGC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** serviço `conta-tools-contabil` no padrão do ecossistema que recebe razão, balancete e plano
exportados do IGC, confere tudo e grava por mês no Postgres, com uma tela de importação.

**Architecture:** pacote Python `conta_tools_contabil` (src layout) com FastAPI, SQLAlchemy Core e
Alembic empacotado, igual ao `conta-tools-nfts`. Leitores puros (`igc/`) transformam os bytes em
dataclasses; `importacao/conferencias.py` é uma função pura que devolve divergências;
`importacao/gravar.py` grava numa transação só se não houver divergência. A API expõe a importação e a
lista de importações; a tela é HTML estático com o menu hambúrguer do ecossistema.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, python-multipart, SQLAlchemy 2 (Core), Alembic,
psycopg 3, conta-tools-shared ≥ 0.16.9, pytest + pytest-xdist, ruff. Leitura de HTML com
`html.parser` da biblioteca padrão (sem pandas).

**Spec:** `docs/superpowers/specs/2026-10-09-conciliacao-contabil-design.md` (seções 4, 5, 11, 12, 13 e 15.1).

## Global Constraints

- Pacote `conta-tools-contabil`, módulo `conta_tools_contabil`, versão inicial `0.1.0`; PATCH sobe a cada round de código.
- Porta 5016; `root_path` vem do `api.conf` (`[api] root_path = /contabil` em produção).
- Sistema no conta-tools-auth: `conta-tools-contabil`. Módulos: `conciliacao`, `ia`. Papéis: `leitura` < `operador` < `responsavel`.
- Acesso por módulo; não existe filtro por empresa.
- Exportações do IGC são HTML em **cp1252**; nunca decodificar como UTF-8.
- Valores monetários sempre `Decimal`, nunca `float`. Internamente todo saldo é D − C.
- Identidade do lançamento: `(cnpj, reduzido, lote_lcto)`.
- Gravação por mês (`"AAAA-MM"`); período informado pelo usuário, sem default (competência obrigatória).
- Importação com qualquer divergência é recusada inteira: nenhum dado de conta ou lançamento é gravado.
- Todas as contas entram (nenhuma exclusão por grupo).
- CNPJ guardado só com dígitos e letras (CNPJ alfanumérico: nunca usar `\D` para limpar); exibido formatado.
- Hora local em timestamps (`datetime.now().isoformat(timespec="seconds")`), nunca UTC.
- Texto da tela sem cinza: cor de texto `#1f2430`.
- `examples/`, `mockups/dados*.js` e `mockups/prints/` têm dado de cliente e não entram no git.
- Commits via `git commit -F <arquivo>`, com `git add` de caminhos explícitos (nunca `git add -A`) e `git diff --cached --stat` antes.
- Testes rodam com `python C:/dev/conta-tools-shared/scripts/testar.py`.

## Review Focus

1. Arquivo trocado no campo errado (balancete no campo do razão): a importação deve dizer qual arquivo não é o que se esperava, não estourar com traceback. Teste na Task 3.
2. Valor com formato inesperado (ex.: `1234.56` ou `1.234,5`): o leitor deve recusar o arquivo, nunca ler um número errado em silêncio. Teste na Task 2.
3. Período informado diferente do período do arquivo (usuário escolhe 07/2026 e manda o razão de 01 a 07): recusar com a divergência `periodo`. Teste na Task 4.
4. Reimportar o mesmo mês com um lançamento a menos: o lançamento que sumiu do IGC deve sumir da base, e os outros manter a identidade. Teste na Task 6.
5. Arquivos de empresas diferentes (razão de uma, plano de outra): recusar com a divergência `empresa`. Teste na Task 4.

---

## Estrutura de arquivos

```
conta-tools-contabil/
  .gitignore
  .githooks/pre-commit                 cópia do nfts
  CLAUDE.md                            regras para o Claude neste repo
  CONTEXT.md                           o que já está implementado
  pyproject.toml
  alembic.ini                          só para `alembic revision` em dev
  example-api.conf
  docs/ACESSOS.md                      tela/rota -> módulo/papel
  src/conta_tools_contabil/
    __init__.py
    __main__.py                        CLI: --version, migrar, provisionar-db, serve
    conf.py                            ApiConf + carregar_api_conf
    db.py                              engine + schema (SQLAlchemy Core)
    migrations.py                      upgrade_head
    autorizacao.py                     RBAC por módulo (pessoa)
    alembic/env.py, script.py.mako, versions/0001_schema_inicial.py
    cli/__init__.py, _common.py, migrar.py, provisionar_db.py
    igc/__init__.py
    igc/html.py                        ler_tabela, numero_br, saldo_dc, normalizar_cnpj, ArquivoInvalido
    igc/plano.py                       ler_plano -> Plano
    igc/balancete.py                   ler_balancete -> Balancete
    igc/razao.py                       ler_razao -> Razao
    importacao/__init__.py
    importacao/periodo.py              meses_do_periodo, mes_anterior, primeiro_dia, ultimo_dia
    importacao/conferencias.py         conferir -> list[Divergencia]; saldos_por_mes
    importacao/gravar.py               importar -> ResultadoImportacao
    api/__init__.py
    api/app.py                         create_app
    api/static/nav.js
    api/static/importacao.html
  tests/
    conftest.py
    igc_fixtures.py                    monta HTML igual ao do IGC
    helpers_app.py
    test_main.py, test_html.py, test_plano.py, test_balancete.py, test_razao.py,
    test_arquivos_reais.py, test_periodo.py, test_conferencias.py, test_db.py,
    test_gravar.py, test_api.py, test_http_auth_sweep.py, test_nav_menu.py
```

---

### Task 1: Repositório, pacote e CLI de versão

**Files:**
- Create: `.gitignore`, `pyproject.toml`, `CLAUDE.md`, `CONTEXT.md`, `.githooks/pre-commit`
- Create: `src/conta_tools_contabil/__init__.py`, `src/conta_tools_contabil/__main__.py`
- Test: `tests/test_main.py`

**Interfaces:**
- Produces: `python -m conta_tools_contabil --version` imprime a versão; `main()` despacha `migrar`, `provisionar-db`, `serve` (as três entram nas Tasks 5 e 7; aqui o despacho já existe e importa sob demanda).

- [ ] **Step 1: `.gitignore`**

```gitignore
__pycache__/
*.pyc
.venv/
venv/
*.egg-info/
.pytest_cache/
.ruff_cache/
build/
dist/
*.db
*.db-journal
*.db-wal
*.db-shm
api.conf
.env
.worktrees/
.superpowers/
# dado de cliente (razão, balancete, plano, F-Sist reais): nunca no git
examples/
mockups/dados.js
mockups/dados-nfse.js
mockups/prints/
```

- [ ] **Step 2: `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "conta-tools-contabil"
version = "0.1.0"
description = "Conciliação contábil a partir das exportações do IGC (razão, balancete, plano de contas)"
requires-python = ">=3.11"
authors = [{ name = "Eric Mauricio" }]
dependencies = [
    "conta-tools-shared>=0.16.9",
    "psycopg[binary]>=3.1",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
]

[project.optional-dependencies]
api = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.29",
    "python-multipart>=0.0.9",
]
dev = [
    "pytest>=8.0",
    "pytest-xdist>=3.5",
    "httpx>=0.27",
    "ruff>=0.4",
]

[tool.setuptools]
package-dir = {"" = "src"}

[tool.setuptools.packages.find]
where = ["src"]

[tool.setuptools.package-data]
conta_tools_contabil = [
    "api/static/*",
    "alembic/env.py",
    "alembic/script.py.mako",
    "alembic/versions/*.py",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-n auto"
python_files = ["test_*.py"]
```

- [ ] **Step 3: `.githooks/pre-commit`**: copiar `C:\dev\conta-tools-nfts\.githooks\pre-commit` sem mudança e ligar:

```bash
cp /c/dev/conta-tools-nfts/.githooks/pre-commit /c/dev/conta-tools-contabil/.githooks/pre-commit
git -C /c/dev/conta-tools-contabil config core.hooksPath .githooks
```

- [ ] **Step 4: `CLAUDE.md`**

```markdown
# conta-tools-contabil: Regras para o Claude

## Antes de qualquer implementação

1. Leia `C:\dev\conta-tools-shared\CLAUDE.md`: hub do ecossistema ContaTools
2. Leia `C:\dev\conta-tools-shared\CONTEXT.md`: o que já existe no shared
3. Leia `C:\dev\conta-tools-launcher\docs\HAMBURGER-MENU.md`: padrão web (menu)
4. Leia [`docs/superpowers/specs/2026-10-09-conciliacao-contabil-design.md`](docs/superpowers/specs/2026-10-09-conciliacao-contabil-design.md): desenho e decisões
5. Leia `CONTEXT.md`: o que este repo já tem implementado

## Este repo

Serviço FastAPI (irmão do `conta-tools-nfts`, sem card no launcher). Ferramenta de produtividade:
acelerar a conciliação contábil com mais precisão. Recebe razão, balancete e plano de contas
exportados do IGC, confere, guarda por mês e (fases seguintes) pareia lançamentos, cruza com NFS-e
do nfts, gera ajustes no CSV de importação do IGC.

## Regras que já custaram caro

- Exportação do IGC é HTML com extensão `.xls` em **cp1252**. Ler como UTF-8 destrói os acentos (o
  protótipo dos mockups fez isso e parecia que a origem vinha sem acento).
- Dinheiro é `Decimal`. Saldo interno é sempre D − C. O sinal do saldo impresso no razão depende da
  natureza da conta (ativo D − C, demais C − D): use o balancete, que traz o lado D/C explícito.
- Débito/Crédito do CSV do IGC é o reduzido **sem o hífen** (`106-6` → `1066`), não sem o dígito.
- Importação com divergência é recusada inteira. Nada de gravar pela metade.
- Nenhuma conta é excluída: o analista escolhe o que conciliar.
- `examples/` e os `dados*.js` dos mockups são dado de cliente: fora do git.

## O que NÃO pertence a este repo

- Notas fiscais (busca, PDF, cobertura): consumir do `conta-tools-nfts` pela porta 5012.
- Cadastro de empresas: identidade vem do `conta-tools-empresas`.
- Ideias adiadas: `C:\dev\conta-tools-shared\docs\PARKING-LOT.md`, nunca aqui.
```

- [ ] **Step 5: `CONTEXT.md`**

```markdown
# conta-tools-contabil: o que já existe

Atualizado a cada round de implementação.

## Fase 1 (esqueleto e importação)

- CLI: `--version`, `migrar`, `provisionar-db`, `serve --conf api.conf`.
- Leitores do IGC (`igc/`): plano, balancete, razão.
- Conferências da importação (`importacao/conferencias.py`) e gravação por mês (`importacao/gravar.py`).
- API: `/version`, `/status`, `/nav.js`, `/me/papeis`, `POST /importacoes`, `GET /importacoes`, tela `/`.
```

- [ ] **Step 6: Write the failing test** `tests/test_main.py`

```python
import subprocess
import sys


def _rodar(*args):
    return subprocess.run(
        [sys.executable, "-m", "conta_tools_contabil", *args],
        capture_output=True, text=True, timeout=60,
    )


def test_version_imprime_a_versao_do_pacote():
    from importlib.metadata import version

    r = _rodar("--version")
    assert r.returncode == 0
    assert version("conta-tools-contabil") in r.stdout


def test_comando_desconhecido_sai_com_erro():
    r = _rodar("nao-existe")
    assert r.returncode == 1
    assert "Comando não reconhecido" in r.stdout


def test_sem_argumento_mostra_uso_e_sai_com_erro():
    r = _rodar()
    assert r.returncode == 1
    assert "migrar" in r.stdout and "serve" in r.stdout
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd /c/dev/conta-tools-contabil && python -m pip install -e ".[api,dev]" && python -m pytest tests/test_main.py -n 0 -v`
Expected: FAIL (`No module named conta_tools_contabil`, já que o pacote ainda não tem `__main__`).

- [ ] **Step 8: Write implementation**

`src/conta_tools_contabil/__init__.py`:

```python
"""Conciliação contábil a partir das exportações do IGC."""
```

`src/conta_tools_contabil/__main__.py`:

```python
"""Entry point: python -m conta_tools_contabil <comando> ..."""

from __future__ import annotations

import sys

from conta_tools_shared.version import handle_version_flags


def main() -> None:
    code = handle_version_flags("conta-tools-contabil", "conta_tools_contabil")
    if code is not None:
        sys.exit(code)

    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        _uso()
        sys.exit(0 if argv else 1)

    cmd, resto = argv[0].lower(), argv[1:]
    if cmd == "migrar":
        from conta_tools_contabil.cli.migrar import main_migrar
        sys.exit(main_migrar(resto))
    elif cmd == "provisionar-db":
        from conta_tools_contabil.cli.provisionar_db import main_provisionar_db
        sys.exit(main_provisionar_db(resto))
    elif cmd == "serve":
        from conta_tools_contabil.cli.serve import main_serve
        sys.exit(main_serve(resto))
    else:
        print(f"Comando não reconhecido: {cmd}")
        print("Disponíveis: migrar, provisionar-db, serve")
        sys.exit(1)


def _uso() -> None:
    print("Uso: python -m conta_tools_contabil <comando> [opcoes]")
    print()
    print("  migrar         Aplica o schema (Alembic upgrade head)")
    print("  provisionar-db Cria role + bancos no Postgres (idempotente)")
    print("  serve          Inicia a API web (--conf api.conf)")
    print()
    print("Flags globais: --version, --about, --help/-h")


if __name__ == "__main__":
    main()
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /c/dev/conta-tools-contabil && python -m pip install -e ".[api,dev]" && python -m pytest tests/test_main.py -n 0 -v`
Expected: 3 passed.

- [ ] **Step 10: Commit** (inclui a spec, o plano e os docs que já existem; `examples/` e dados dos mockups ficam fora pelo `.gitignore`)

```bash
cd /c/dev/conta-tools-contabil
git add .gitignore pyproject.toml CLAUDE.md CONTEXT.md .githooks/pre-commit src/conta_tools_contabil/__init__.py src/conta_tools_contabil/__main__.py tests/test_main.py docs/ mockups/
git status --short    # conferir: nada de examples/, mockups/dados.js, mockups/dados-nfse.js, mockups/prints/
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "chore: esqueleto do conta-tools-contabil (pacote, CLI de versão, docs, mockups)"
```

---

### Task 2: Leitura de tabela HTML do IGC e números

**Files:**
- Create: `src/conta_tools_contabil/igc/__init__.py` (vazio), `src/conta_tools_contabil/igc/html.py`
- Create: `tests/igc_fixtures.py`
- Test: `tests/test_html.py`

**Interfaces:**
- Produces:
  - `class ArquivoInvalido(ValueError)`
  - `ler_tabela(conteudo: bytes) -> list[list[str]]`
  - `numero_br(texto: str) -> Decimal` (vazio → `Decimal("0")`)
  - `saldo_dc(texto: str) -> Decimal` (`"1.234,56 D"` → `1234.56`; `"C"` → negativo; `"0,00"` → 0)
  - `normalizar_cnpj(texto: str) -> str` (só dígitos e letras, maiúsculas)
  - `tests/igc_fixtures.py`: `tabela_html(linhas: list[list[str]]) -> bytes` (cp1252, mesmo markup do IGC)

- [ ] **Step 1: Fixture que imita o IGC** `tests/igc_fixtures.py`

```python
"""Monta HTML no mesmo formato das exportações do IGC (cp1252, <tr >/<td>/<font>).

Usado no lugar dos arquivos reais (dado de cliente, fora do git). O markup foi copiado do
balancete real: célula com estilo, texto dentro de <font>, às vezes com <b>."""

from __future__ import annotations


def tabela_html(linhas: list[list[str]], titulo: str = "Relatório") -> bytes:
    partes = [f"<html >\r\n<title >\r\n{titulo}\r\n</title >\r\n<body >\r\n<table >\r\n"]
    for linha in linhas:
        partes.append("<tr >\r\n")
        for celula in linha:
            partes.append(
                '<td style="width:64,25px" align="Left">\r\n'
                f'<font face="Arial" size="3" color="black"><b>{celula}</b></font>\r\n</td>\r\n'
            )
        partes.append("</tr>\r\n")
    partes.append("</table>\r\n</body>\r\n</html>\r\n")
    return "".join(partes).encode("cp1252")
```

- [ ] **Step 2: Write the failing test** `tests/test_html.py`

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/dev/conta-tools-contabil && python -m pytest tests/test_html.py -n 0 -v`
Expected: FAIL com `ModuleNotFoundError: conta_tools_contabil.igc`.

- [ ] **Step 4: Write implementation** `src/conta_tools_contabil/igc/html.py`

```python
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
    return Decimal(t.replace(".", "").replace(",", "."))


def saldo_dc(texto: str) -> Decimal:
    """Saldo do balancete com o lado: `"1.234,56 D"` -> 1234.56, `"... C"` -> negativo (D − C)."""
    m = re.fullmatch(r"(\S+)\s*([DC]?)", texto.strip())
    if not m:
        raise ArquivoInvalido(f"saldo fora do formato '1.234,56 D': {texto!r}")
    valor = numero_br(m.group(1))
    if valor and not m.group(2):
        raise ArquivoInvalido(f"saldo sem o lado D/C: {texto!r}")
    return -valor if m.group(2) == "C" else valor


def normalizar_cnpj(texto: str) -> str:
    """Só dígitos e letras, maiúsculas. Não usar `\\D`: o CNPJ alfanumérico tem letras."""
    return re.sub(r"[^0-9A-Za-z]", "", texto).upper()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/dev/conta-tools-contabil && python -m pytest tests/test_html.py -n 0 -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/conta_tools_contabil/igc/__init__.py src/conta_tools_contabil/igc/html.py tests/igc_fixtures.py tests/test_html.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: leitura de tabela HTML do IGC (cp1252) e números"
```

---

### Task 3: Leitores do plano, do balancete e do razão

**Files:**
- Create: `src/conta_tools_contabil/igc/plano.py`, `igc/balancete.py`, `igc/razao.py`
- Test: `tests/test_plano.py`, `tests/test_balancete.py`, `tests/test_razao.py`, `tests/test_arquivos_reais.py`

**Interfaces:**
- Consumes: `ler_tabela`, `numero_br`, `saldo_dc`, `normalizar_cnpj`, `ArquivoInvalido` (Task 2).
- Produces:

```python
# igc/plano.py
@dataclass(frozen=True)
class ContaPlano:
    classificacao: str   # "2.1.1.01.0445"
    reduzido: str        # "121-0"; "" nas sintéticas
    descricao: str
    cnpj: str            # normalizado; "" quando não tem
    grau: int

@dataclass
class Plano:
    empresa_nome: str
    contas: list[ContaPlano]

def ler_plano(conteudo: bytes) -> Plano

# igc/balancete.py
@dataclass(frozen=True)
class LinhaBalancete:
    classificacao: str
    reduzido: str
    descricao: str
    saldo_anterior: Decimal   # D − C
    debito: Decimal
    credito: Decimal
    saldo_atual: Decimal      # D − C

@dataclass
class Balancete:
    cnpj: str
    mes_inicio: str           # "AAAA-MM"
    mes_fim: str
    linhas: list[LinhaBalancete]   # só analíticas (com reduzido)
    total_debito: Decimal          # linha TOTAL GERAL
    total_credito: Decimal

def ler_balancete(conteudo: bytes) -> Balancete

# igc/razao.py
@dataclass(frozen=True)
class LancamentoRazao:
    data: date
    historico: str
    contrapartida: str        # reduzido, "-" (sem contrapartida) ou ""
    lote_lcto: str            # "240/19096489"
    debito: Decimal
    credito: Decimal
    saldo_impresso: Decimal   # como o IGC imprime (sinal da natureza)

@dataclass
class ContaRazao:
    conta: str                # "111010001"
    reduzido: str             # "1-9"
    nome: str
    saldo_anterior_impresso: Decimal
    lancamentos: list[LancamentoRazao]
    total_debito: Decimal | None    # linha "Total da Conta:"
    total_credito: Decimal | None

@dataclass
class Razao:
    codigo_igc: str           # "43"
    empresa_nome: str
    inicio: date
    fim: date
    contas: list[ContaRazao]

def ler_razao(conteudo: bytes) -> Razao
```

Formato real (conferido em 2026-10-09 nos arquivos da Brasil Reverso):
- Plano: cabeçalho `Classificação | Código | Descrição | CNPJ Cliente/Fornecedor | Grau | Tipo`; 1ª célula do arquivo é o nome da empresa.
- Balancete: cabeçalho tem `CNPJ: 07.213.542/0001-91` e, em células separadas, `Período:` e `01/2026 a 07/2026`; linha analítica `[classificação, reduzido, descrição, "", "28.581,14 D", "1.341,30", "10.614,14", "19.308,30 D"]`; linha `["", "", "TOTAL GERAL", "", "0,00", D, C, "0,00"]`.
- Razão: 1ª célula `43 - BRASIL REVERSO GERENCIAMENTO DE DESCARTA`; célula `Período: 01/01/2026 a 31/07/2026`; abertura `["Conta: 111010001", "Red.: 1-9 CAIXA", "", "", "", "", "Saldo Anterior:", "28.581,14"]`; lançamento `["05/01/2026", histórico, "", "35-3", "0/20489368", débito, crédito, saldo]`; fechamento `["", "", "", "", "Total da Conta:", D, C, saldo]`. Toda linha tem 8 células.

- [ ] **Step 1: Write the failing tests**

`tests/test_plano.py`:

```python
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
```

`tests/test_balancete.py`:

```python
from decimal import Decimal

import pytest
from igc_fixtures import tabela_html

from conta_tools_contabil.igc.balancete import ler_balancete
from conta_tools_contabil.igc.html import ArquivoInvalido

D = Decimal


def _balancete(*linhas, periodo="01/2026 a 07/2026"):
    return tabela_html([
        ["CNPJ: 07.213.542/0001-91", "", "", "", "", "Página:", "", "1"],
        ["Contabilidade", "", "Balancete de Verificação", "", "", "Emissão:", "", "08/10/2026"],
        ["Consolidação: Empresa", "", "Grau: 5", "", "Período:", periodo, "", ""],
        ["Conta", "Reduzida", "Descrição", "", "Saldo Anterior", "Débito", "Crédito", "Saldo Atual"],
        ["1", "", "ATIVO", "", "28.581,14 D", "1.341,30", "10.614,14", "19.308,30 D"],
        *linhas,
        ["", "", "TOTAL GERAL", "", "0,00", "1.341,30", "1.341,30", "0,00"],
    ])


def test_le_cabecalho_e_so_linhas_analiticas():
    b = ler_balancete(_balancete(
        ["1.1.1.01.0001", "1-9", "CAIXA", "", "28.581,14 D", "1.341,30", "10.614,14", "19.308,30 D"],
        ["2.1.1.01.0445", "121-0", "VIANA", "", "100,00 C", "0,00", "0,00", "100,00 C"],
    ))
    assert b.cnpj == "07213542000191"
    assert (b.mes_inicio, b.mes_fim) == ("2026-01", "2026-07")
    assert [x.reduzido for x in b.linhas] == ["1-9", "121-0"]
    assert b.linhas[0].saldo_anterior == D("28581.14")
    assert b.linhas[1].saldo_atual == D("-100.00")
    assert (b.total_debito, b.total_credito) == (D("1341.30"), D("1341.30"))


def test_recusa_sem_periodo():
    with pytest.raises(ArquivoInvalido, match="Período"):
        ler_balancete(_balancete(periodo="julho"))


def test_recusa_razao_no_campo_do_balancete():
    razao = tabela_html([["43 - ACME LTDA", "", "", "", "", "", "Página:", "1"],
                         ["Consolidação: Empresa", "", "", "", "", "", "", "Período: 01/01/2026 a 31/07/2026"]])
    with pytest.raises(ArquivoInvalido, match="balancete"):
        ler_balancete(razao)
```

`tests/test_razao.py`:

```python
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
        ["Conta: 246020001", "Red.: 1634-9 (-) DISTRIBUIÇÃO LUCROS", "", "", "", "", "Saldo Anterior:", "-2.875.157,33"],
    ))
    assert r.contas[0].saldo_anterior_impresso == D("-2875157.33")
    assert r.contas[0].nome == "(-) DISTRIBUIÇÃO LUCROS"


def test_recusa_lancamento_antes_de_qualquer_conta():
    with pytest.raises(ArquivoInvalido, match="antes"):
        ler_razao(_razao(["05/01/2026", "X", "", "-", "0/1", "1,00", "", "1,00"]))


def test_recusa_arquivo_que_nao_e_razao():
    with pytest.raises(ArquivoInvalido, match="razão"):
        ler_razao(tabela_html([["CNPJ: 07.213.542/0001-91"], ["Período:", "01/2026 a 07/2026"]]))
```

`tests/test_arquivos_reais.py` (roda só onde os arquivos de cliente existem; nunca no CI):

```python
"""Leitura dos arquivos reais da Brasil Reverso (jan a jul/2026). Números conferidos em 2026-10-09."""

from pathlib import Path

import pytest

EX = Path(__file__).resolve().parents[1] / "examples"
RAZAO, BALANCETE, PLANO = (EX / f"{n} - BRASIL REVERSO 2026.xls" for n in ("RAZAO", "BALANCETE", "PLANO DE CONTAS"))

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
    assert any(c.descricao == "ALUGUÉIS" or "ALUGUÉIS" in c.descricao for c in p.contas)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_plano.py tests/test_balancete.py tests/test_razao.py -n 0 -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Write implementation**

`src/conta_tools_contabil/igc/plano.py`:

```python
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
    reduzido: str
    descricao: str
    cnpj: str
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
            raise ArquivoInvalido(f"plano: reduzido fora do formato 123-4 em {linha[0]}: {reduzido!r}")
        grau = int(linha[4]) if linha[4].isdigit() else 0
        contas.append(ContaPlano(linha[0], reduzido, linha[2], normalizar_cnpj(linha[3]), grau))
    if not any(c.reduzido for c in contas):
        raise ArquivoInvalido("plano de contas sem nenhuma conta analítica (com código reduzido)")
    return Plano(empresa_nome=linhas[0][0] if linhas and linhas[0] else "", contas=contas)
```

`src/conta_tools_contabil/igc/balancete.py`:

```python
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
    saldo_anterior: Decimal
    debito: Decimal
    credito: Decimal
    saldo_atual: Decimal


@dataclass
class Balancete:
    cnpj: str
    mes_inicio: str
    mes_fim: str
    linhas: list[LinhaBalancete]
    total_debito: Decimal
    total_credito: Decimal


def ler_balancete(conteudo: bytes) -> Balancete:
    linhas = ler_tabela(conteudo)
    celulas = [c for linha in linhas[:12] for c in linha if c]
    cnpj = next((normalizar_cnpj(c[5:]) for c in celulas if c.startswith("CNPJ:")), "")
    if not cnpj:
        raise ArquivoInvalido("não parece um balancete do IGC: falta 'CNPJ:' no cabeçalho")
    periodo = next(
        (celulas[i + 1] for i, c in enumerate(celulas) if c == "Período:" and i + 1 < len(celulas)), ""
    )
    m = re.fullmatch(r"(\d\d)/(\d{4}) a (\d\d)/(\d{4})", periodo)
    if not m:
        raise ArquivoInvalido(f"balancete sem 'Período: mm/aaaa a mm/aaaa' no cabeçalho (achei {periodo!r})")
    total = next((x for x in linhas if len(x) >= 8 and x[2] == "TOTAL GERAL"), None)
    if total is None:
        raise ArquivoInvalido("balancete sem a linha TOTAL GERAL")
    analiticas = [
        LinhaBalancete(x[0], x[1], x[2], saldo_dc(x[4]), numero_br(x[5]), numero_br(x[6]), saldo_dc(x[7]))
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
```

`src/conta_tools_contabil/igc/razao.py`:

```python
"""Razão analítico exportado do IGC: blocos por conta."""

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
    contrapartida: str
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
    return datetime.strptime(texto, "%d/%m/%Y").date()


def ler_razao(conteudo: bytes) -> Razao:
    linhas = ler_tabela(conteudo)
    celulas = [c for linha in linhas[:12] for c in linha if c]
    periodo = next((m for c in celulas if (m := _PERIODO.fullmatch(c))), None)
    empresa = re.fullmatch(r"(\d+) - (.+)", linhas[0][0]) if linhas and linhas[0] else None
    if not periodo or not empresa:
        raise ArquivoInvalido(
            "não parece um razão do IGC: falta '<código> - <empresa>' ou 'Período: dd/mm/aaaa a dd/mm/aaaa'"
        )
    contas: list[ContaRazao] = []
    atual: ContaRazao | None = None
    for linha in linhas:
        if len(linha) < 8:
            continue
        if linha[0].startswith("Conta:"):
            m = re.fullmatch(r"Red\.:\s*(\S+)\s+(.*)", linha[1])
            if not m:
                raise ArquivoInvalido(f"razão: abertura de conta sem 'Red.: <reduzido> <nome>': {linha[1]!r}")
            atual = ContaRazao(
                conta=linha[0].split(":", 1)[1].strip(), reduzido=m[1], nome=m[2],
                saldo_anterior_impresso=numero_br(linha[7]),
            )
            contas.append(atual)
        elif _DATA.fullmatch(linha[0]):
            if atual is None:
                raise ArquivoInvalido("razão: lançamento antes de qualquer 'Conta:'")
            atual.lancamentos.append(LancamentoRazao(
                data=_data(linha[0]), historico=linha[1], contrapartida=linha[3], lote_lcto=linha[4],
                debito=numero_br(linha[5]), credito=numero_br(linha[6]), saldo_impresso=numero_br(linha[7]),
            ))
        elif linha[4] == "Total da Conta:" and atual is not None:
            atual.total_debito, atual.total_credito = numero_br(linha[5]), numero_br(linha[6])
    return Razao(
        codigo_igc=empresa[1], empresa_nome=empresa[2], inicio=_data(periodo[1]), fim=_data(periodo[2]),
        contas=contas,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_plano.py tests/test_balancete.py tests/test_razao.py tests/test_arquivos_reais.py -n 0 -v`
Expected: all passed (os 3 de `test_arquivos_reais.py` passam nesta máquina, que tem `examples/`).

- [ ] **Step 5: Commit**

```bash
git add src/conta_tools_contabil/igc/plano.py src/conta_tools_contabil/igc/balancete.py src/conta_tools_contabil/igc/razao.py tests/test_plano.py tests/test_balancete.py tests/test_razao.py tests/test_arquivos_reais.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: leitores do plano, balancete e razão do IGC"
```

---

### Task 4: Período e conferências

**Files:**
- Create: `src/conta_tools_contabil/importacao/__init__.py` (vazio), `importacao/periodo.py`, `importacao/conferencias.py`
- Test: `tests/test_periodo.py`, `tests/test_conferencias.py`

**Interfaces:**
- Consumes: `Razao`, `Balancete`, `Plano` (Task 3).
- Produces:

```python
# importacao/periodo.py
def validar_mes(texto: str) -> str                  # "2026-07" ok; outro formato -> ValueError
def meses_do_periodo(inicio: str, fim: str) -> list[str]   # ["2026-01", ..., "2026-07"]; fim < inicio -> ValueError
def mes_anterior(mes: str) -> str                   # "2026-01" -> "2025-12"
def primeiro_dia(mes: str) -> date
def ultimo_dia(mes: str) -> date

# importacao/conferencias.py
@dataclass(frozen=True)
class Divergencia:
    conferencia: str        # código estável (lista abaixo)
    reduzido: str | None
    mensagem: str

@dataclass(frozen=True)
class SaldoMes:
    reduzido: str
    mes: str
    saldo_anterior: Decimal
    debito: Decimal
    credito: Decimal
    saldo_final: Decimal

def conferir(razao, balancete, plano, *, mes_inicio: str, mes_fim: str,
             saldo_final_anterior: dict[str, Decimal]) -> list[Divergencia]
def saldos_por_mes(razao, balancete, *, mes_inicio: str, mes_fim: str) -> list[SaldoMes]
```

Códigos de conferência (estáveis, a tela mostra a mensagem): `periodo`, `empresa`, `balancete_fecha`,
`conta_sem_balancete`, `conta_sem_razao`, `razao_x_balancete`, `total_da_conta`, `conta_fora_do_plano`,
`lancamento_fora_do_periodo`, `lancamento_repetido`, `saldo_anterior`.

- [ ] **Step 1: Write the failing tests**

`tests/test_periodo.py`:

```python
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
```

`tests/test_conferencias.py` (monta objetos direto, sem HTML):

```python
from datetime import date
from decimal import Decimal

from conta_tools_contabil.igc.balancete import Balancete, LinhaBalancete
from conta_tools_contabil.igc.plano import ContaPlano, Plano
from conta_tools_contabil.igc.razao import ContaRazao, LancamentoRazao, Razao
from conta_tools_contabil.importacao.conferencias import conferir, saldos_por_mes

D = Decimal


def _lanc(dia, deb, cred, lote, mes=1):
    return LancamentoRazao(date(2026, mes, dia), "H", "-", lote, D(deb), D(cred), D("0"))


def _cenario():
    """Duas contas: CAIXA (ativo, 100 D -> 130 D em jan/fev) e FORNEC (passivo, 30 C -> 0)."""
    razao = Razao("43", "ACME LTDA", date(2026, 1, 1), date(2026, 2, 28), [
        ContaRazao("111", "1-9", "CAIXA", D("100"), [_lanc(5, "50", "0", "1/1"), _lanc(3, "0", "20", "1/2", mes=2)], D("50"), D("20")),
        ContaRazao("211", "2-7", "FORNEC", D("30"), [_lanc(9, "30", "0", "1/3")], D("30"), D("0")),
    ])
    balancete = Balancete("07213542000191", "2026-01", "2026-02", [
        LinhaBalancete("1.1", "1-9", "CAIXA", D("100"), D("50"), D("20"), D("130")),
        LinhaBalancete("2.1", "2-7", "FORNEC", D("-30"), D("30"), D("0"), D("0")),
        LinhaBalancete("1.2", "3-5", "IMOVEIS", D("-100"), D("0"), D("0"), D("-100")),
    ], D("80"), D("80"))
    plano = Plano("ACME LTDA", [
        ContaPlano("1.1", "1-9", "CAIXA", "", 5), ContaPlano("2.1", "2-7", "FORNEC", "", 5),
        ContaPlano("1.2", "3-5", "IMOVEIS", "", 5),
    ])
    return razao, balancete, plano


def _conferir(razao, balancete, plano, anterior=None, ini="2026-01", fim="2026-02"):
    return conferir(razao, balancete, plano, mes_inicio=ini, mes_fim=fim, saldo_final_anterior=anterior or {})


def _codigos(divs):
    return sorted({d.conferencia for d in divs})


def test_cenario_consistente_nao_tem_divergencia():
    assert _conferir(*_cenario()) == []


def test_periodo_informado_diferente_do_arquivo():
    assert _codigos(_conferir(*_cenario(), ini="2026-02")) == ["periodo"]


def test_empresas_diferentes():
    razao, balancete, plano = _cenario()
    plano.empresa_nome = "OUTRA EMPRESA"
    assert _codigos(_conferir(razao, balancete, plano)) == ["empresa"]


def test_balancete_que_nao_fecha():
    razao, balancete, plano = _cenario()
    balancete.total_credito = D("79")
    assert "balancete_fecha" in _codigos(_conferir(razao, balancete, plano))


def test_razao_divergente_do_balancete():
    razao, balancete, plano = _cenario()
    balancete.linhas[0] = LinhaBalancete("1.1", "1-9", "CAIXA", D("100"), D("51"), D("20"), D("131"))
    divs = _conferir(razao, balancete, plano)
    assert "razao_x_balancete" in _codigos(divs)
    assert any(d.reduzido == "1-9" for d in divs)


def test_total_da_conta_divergente():
    razao, balancete, plano = _cenario()
    razao.contas[0].total_debito = D("49")
    assert _codigos(_conferir(razao, balancete, plano)) == ["total_da_conta"]


def test_conta_do_razao_fora_do_balancete_e_do_plano():
    razao, balancete, plano = _cenario()
    razao.contas.append(ContaRazao("999", "9-9", "NOVA", D("0"), [], D("0"), D("0")))
    assert _codigos(_conferir(razao, balancete, plano)) == ["conta_fora_do_plano", "conta_sem_balancete"]


def test_conta_com_movimento_so_no_balancete():
    razao, balancete, plano = _cenario()
    balancete.linhas[2] = LinhaBalancete("1.2", "3-5", "IMOVEIS", D("-100"), D("10"), D("0"), D("-90"))
    assert "conta_sem_razao" in _codigos(_conferir(razao, balancete, plano))


def test_lancamento_fora_do_periodo_e_repetido():
    razao, balancete, plano = _cenario()
    razao.contas[1].lancamentos.append(LancamentoRazao(date(2026, 3, 1), "H", "-", "1/3", D("0"), D("0"), D("0")))
    assert {"lancamento_fora_do_periodo", "lancamento_repetido"} <= set(_codigos(_conferir(razao, balancete, plano)))


def test_saldo_anterior_diferente_do_mes_anterior_gravado():
    divs = _conferir(*_cenario(), anterior={"1-9": D("99"), "2-7": D("-30")})
    assert _codigos(divs) == ["saldo_anterior"]
    assert divs[0].reduzido == "1-9"


def test_saldos_por_mes():
    razao, balancete, _ = _cenario()
    s = {(x.reduzido, x.mes): x for x in saldos_por_mes(razao, balancete, mes_inicio="2026-01", mes_fim="2026-02")}
    assert (s["1-9", "2026-01"].saldo_anterior, s["1-9", "2026-01"].saldo_final) == (D("100"), D("150"))
    assert (s["1-9", "2026-02"].saldo_anterior, s["1-9", "2026-02"].credito, s["1-9", "2026-02"].saldo_final) == (D("150"), D("20"), D("130"))
    assert s["3-5", "2026-02"].saldo_final == D("-100")   # conta sem movimento entra com o saldo
    assert len(s) == 6
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_periodo.py tests/test_conferencias.py -n 0 -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Write implementation**

`src/conta_tools_contabil/importacao/periodo.py`:

```python
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
```

`src/conta_tools_contabil/importacao/conferencias.py`:

```python
"""Conferências da importação: função pura, devolve as divergências encontradas.

Regra da spec (seção 4): qualquer divergência recusa a importação inteira. Por isso a função
devolve TODAS as divergências de uma vez, para o analista corrigir a exportação numa ida só."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from decimal import Decimal

from conta_tools_contabil.igc.balancete import Balancete
from conta_tools_contabil.igc.plano import Plano
from conta_tools_contabil.igc.razao import Razao
from conta_tools_contabil.importacao.periodo import meses_do_periodo, primeiro_dia, ultimo_dia

ZERO = Decimal("0")


@dataclass(frozen=True)
class Divergencia:
    conferencia: str
    reduzido: str | None
    mensagem: str


@dataclass(frozen=True)
class SaldoMes:
    reduzido: str
    mes: str
    saldo_anterior: Decimal
    debito: Decimal
    credito: Decimal
    saldo_final: Decimal


def _br(v: Decimal) -> str:
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def conferir(
    razao: Razao, balancete: Balancete, plano: Plano, *, mes_inicio: str, mes_fim: str,
    saldo_final_anterior: dict[str, Decimal],
) -> list[Divergencia]:
    div: list[Divergencia] = []

    def add(codigo: str, reduzido: str | None, msg: str) -> None:
        div.append(Divergencia(codigo, reduzido, msg))

    # período: o informado pelo analista tem que ser o dos dois arquivos
    if (balancete.mes_inicio, balancete.mes_fim) != (mes_inicio, mes_fim):
        add("periodo", None, f"balancete é de {balancete.mes_inicio} a {balancete.mes_fim}; informado {mes_inicio} a {mes_fim}")
    if (razao.inicio, razao.fim) != (primeiro_dia(mes_inicio), ultimo_dia(mes_fim)):
        add("periodo", None, f"razão é de {razao.inicio:%d/%m/%Y} a {razao.fim:%d/%m/%Y}; informado {mes_inicio} a {mes_fim}")

    # empresa: o balancete não traz o nome; razão e plano trazem
    if razao.empresa_nome.strip().casefold() != plano.empresa_nome.strip().casefold():
        add("empresa", None, f"razão é de '{razao.empresa_nome}' e o plano de '{plano.empresa_nome}'")

    # balancete fecha
    soma = lambda campo: sum((getattr(x, campo) for x in balancete.linhas), ZERO)  # noqa: E731
    if not (soma("debito") == soma("credito") == balancete.total_debito == balancete.total_credito
            and soma("saldo_anterior") == ZERO and soma("saldo_atual") == ZERO):
        add("balancete_fecha", None,
            f"balancete não fecha: débitos {_br(soma('debito'))}, créditos {_br(soma('credito'))}, "
            f"TOTAL GERAL {_br(balancete.total_debito)} / {_br(balancete.total_credito)}")

    plano_reduzidos = {c.reduzido for c in plano.contas if c.reduzido}
    bal = {x.reduzido: x for x in balancete.linhas}
    no_razao = {c.reduzido for c in razao.contas}
    meses = meses_do_periodo(mes_inicio, mes_fim)
    ini, fim = primeiro_dia(meses[0]), ultimo_dia(meses[-1])

    for conta in razao.contas:
        r = conta.reduzido
        if r not in plano_reduzidos:
            add("conta_fora_do_plano", r, f"conta {r} {conta.nome} está no razão e não no plano de contas")
        deb = sum((l.debito for l in conta.lancamentos), ZERO)
        cred = sum((l.credito for l in conta.lancamentos), ZERO)
        if conta.total_debito is not None and (deb, cred) != (conta.total_debito, conta.total_credito):
            add("total_da_conta", r, f"conta {r}: soma dos lançamentos D {_br(deb)} C {_br(cred)} difere do 'Total da Conta'")
        for lote, n in Counter(l.lote_lcto for l in conta.lancamentos).items():
            if n > 1:
                add("lancamento_repetido", r, f"conta {r}: Lote/Lcto {lote} aparece {n} vezes")
        for l in conta.lancamentos:
            if not ini <= l.data <= fim:
                add("lancamento_fora_do_periodo", r, f"conta {r}: lançamento {l.lote_lcto} em {l.data:%d/%m/%Y}")
        b = bal.get(r)
        if b is None:
            add("conta_sem_balancete", r, f"conta {r} {conta.nome} está no razão e não no balancete")
            continue
        # o razão imprime o saldo com o sinal da natureza; o balancete traz o lado D/C: compara valor absoluto
        ultimo = conta.lancamentos[-1].saldo_impresso if conta.lancamentos else conta.saldo_anterior_impresso
        if (deb, cred) != (b.debito, b.credito) or b.saldo_anterior + deb - cred != b.saldo_atual \
                or abs(conta.saldo_anterior_impresso) != abs(b.saldo_anterior) or abs(ultimo) != abs(b.saldo_atual):
            add("razao_x_balancete", r,
                f"conta {r}: razão (ant {_br(conta.saldo_anterior_impresso)}, D {_br(deb)}, C {_br(cred)}) "
                f"x balancete (ant {_br(b.saldo_anterior)}, D {_br(b.debito)}, C {_br(b.credito)}, atual {_br(b.saldo_atual)})")

    for b in balancete.linhas:
        if b.reduzido not in no_razao and (b.debito or b.credito):
            add("conta_sem_razao", b.reduzido, f"conta {b.reduzido} {b.descricao} tem movimento no balancete e não está no razão")
        if b.reduzido not in plano_reduzidos and b.reduzido not in no_razao:
            add("conta_fora_do_plano", b.reduzido, f"conta {b.reduzido} {b.descricao} está no balancete e não no plano de contas")

    # continuidade com o mês anterior já gravado
    for reduzido, saldo in saldo_final_anterior.items():
        atual = bal[reduzido].saldo_anterior if reduzido in bal else ZERO
        if atual != saldo:
            add("saldo_anterior", reduzido,
                f"conta {reduzido}: saldo anterior {_br(atual)} difere do saldo final gravado do mês anterior {_br(saldo)}")
    return div


def saldos_por_mes(razao: Razao, balancete: Balancete, *, mes_inicio: str, mes_fim: str) -> list[SaldoMes]:
    """Saldo de cada conta do balancete em cada mês. Só chamar depois de `conferir` sem divergência."""
    lancs = {c.reduzido: c.lancamentos for c in razao.contas}
    saida = []
    for b in balancete.linhas:
        saldo = b.saldo_anterior
        for mes in meses_do_periodo(mes_inicio, mes_fim):
            doms = [l for l in lancs.get(b.reduzido, []) if f"{l.data:%Y-%m}" == mes]
            deb = sum((l.debito for l in doms), ZERO)
            cred = sum((l.credito for l in doms), ZERO)
            saida.append(SaldoMes(b.reduzido, mes, saldo, deb, cred, saldo + deb - cred))
            saldo = saldo + deb - cred
    return saida
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_periodo.py tests/test_conferencias.py -n 0 -v`
Expected: all passed.

- [ ] **Step 5: Teste com os arquivos reais** (acrescentar em `tests/test_arquivos_reais.py`)

```python
def test_arquivos_reais_nao_tem_divergencia():
    from conta_tools_contabil.igc.balancete import ler_balancete
    from conta_tools_contabil.igc.plano import ler_plano
    from conta_tools_contabil.igc.razao import ler_razao
    from conta_tools_contabil.importacao.conferencias import conferir, saldos_por_mes

    r, b, p = ler_razao(RAZAO.read_bytes()), ler_balancete(BALANCETE.read_bytes()), ler_plano(PLANO.read_bytes())
    assert conferir(r, b, p, mes_inicio="2026-01", mes_fim="2026-07", saldo_final_anterior={}) == []
    assert len(saldos_por_mes(r, b, mes_inicio="2026-01", mes_fim="2026-07")) == 378 * 7
```

Run: `python -m pytest tests/test_arquivos_reais.py -n 0 -v`: Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/conta_tools_contabil/importacao/__init__.py src/conta_tools_contabil/importacao/periodo.py src/conta_tools_contabil/importacao/conferencias.py tests/test_periodo.py tests/test_conferencias.py tests/test_arquivos_reais.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: conferências da importação e saldos por mês"
```

---

### Task 5: Configuração, schema, migrações e CLI de banco

**Files:**
- Create: `src/conta_tools_contabil/conf.py`, `db.py`, `migrations.py`
- Create: `src/conta_tools_contabil/alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/0001_schema_inicial.py`
- Create: `src/conta_tools_contabil/cli/__init__.py` (vazio), `cli/_common.py`, `cli/migrar.py`, `cli/provisionar_db.py`
- Create: `alembic.ini`, `example-api.conf`
- Test: `tests/test_db.py`

**Interfaces:**
- Produces:
  - `ApiConf(host, port, root_path, db_url, auth_jwt_segredo)`, `carregar_api_conf(caminho: Path) -> ApiConf`
  - `db.metadata`, tabelas `importacao`, `plano_conta`, `conta_mes`, `lancamento`; `db.set_database_url(url)`, `db.get_engine()`, `db.criar_schema(engine)`
  - `migrations.upgrade_head()`

- [ ] **Step 1: Write the failing test** `tests/test_db.py`

```python
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

from conta_tools_contabil import db
from conta_tools_contabil.conf import carregar_api_conf


def test_migracao_cria_o_mesmo_schema_do_metadata(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    from conta_tools_contabil.migrations import upgrade_head

    upgrade_head()
    tabelas = set(inspect(create_engine(url)).get_table_names()) - {"alembic_version"}
    assert tabelas == set(db.metadata.tables) == {"importacao", "plano_conta", "conta_mes", "lancamento"}


def test_carregar_api_conf(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("CONTA_TOOLS_AUTH_JWT_SECRET", raising=False)
    conf = tmp_path / "api.conf"
    conf.write_text("[api]\nport = 5016\nroot_path = contabil/\n[db]\nurl = sqlite://\n", encoding="utf-8")
    c = carregar_api_conf(conf)
    assert (c.port, c.root_path, c.db_url, c.auth_jwt_segredo) == (5016, "/contabil", "sqlite://", "")


def test_segredo_vem_da_env_quando_vazio_no_conf(tmp_path, monkeypatch):
    monkeypatch.setenv("CONTA_TOOLS_AUTH_JWT_SECRET", "s3")
    conf = tmp_path / "api.conf"
    conf.write_text("[api]\nport = 5016\n", encoding="utf-8")
    assert carregar_api_conf(conf).auth_jwt_segredo == "s3"


def test_conf_ausente():
    with pytest.raises(FileNotFoundError):
        carregar_api_conf(Path("nao-existe.conf"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_db.py -n 0 -v`: Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Write implementation**

`src/conta_tools_contabil/conf.py`:

```python
"""Leitura do api.conf."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from conta_tools_shared.config import Campo, carregar_conf_generico, carregar_ini


@dataclass
class ApiConf:
    host: str = "127.0.0.1"
    port: int = 5016
    # Prefixo do Caddy (`handle_path /contabil/*` remove o prefixo): sem isto o redirect de tela
    # sem sessão manda para /auth/?next=/ e o usuário cai num 404 depois do login.
    root_path: str = ""
    db_url: str = ""
    auth_jwt_segredo: str = ""   # vazio = modo local/dev, sem autorização


def carregar_api_conf(caminho: Path) -> ApiConf:
    if not caminho.exists():
        raise FileNotFoundError(f"api.conf não encontrado: {caminho}")
    campos = carregar_conf_generico(carregar_ini(caminho), [
        Campo("api", "host", "host", default="127.0.0.1"),
        Campo("api", "port", "port", tipo=int, default=5016),
        Campo("api", "root_path", "root_path", rstrip_barra=True),
        Campo("db", "url", "db_url"),
        Campo("auth", "jwt_segredo", "auth_jwt_segredo"),
    ])
    if campos["root_path"]:
        campos["root_path"] = "/" + campos["root_path"].strip("/")
    # mesmo segredo do conta-tools-auth, que o lê desta env: evita copiar o segredo para o disco
    if not campos["auth_jwt_segredo"]:
        campos["auth_jwt_segredo"] = os.environ.get("CONTA_TOOLS_AUTH_JWT_SECRET", "")
    return ApiConf(**campos)
```

`src/conta_tools_contabil/db.py`:

```python
"""Engine e schema (SQLAlchemy Core). `metadata` é a fonte da verdade; as migrações em
alembic/versions/ seguem ela."""

from __future__ import annotations

from conta_tools_shared.db_bootstrap import criar_engine, resolver_database_url
from sqlalchemy import (
    CheckConstraint, Column, Engine, ForeignKey, Index, Integer, MetaData, Numeric, String, Table, Text,
)

metadata = MetaData()

# Uma linha por envio, aceito ou recusado: o histórico de importações é o que o analista consulta
# para saber o que já entrou. `divergencias` é JSON (lista de {conferencia, reduzido, mensagem}).
importacao = Table(
    "importacao", metadata,
    Column("id", String, primary_key=True),
    Column("cnpj", String, nullable=False),
    Column("codigo_igc", String, nullable=False),
    Column("empresa_nome", String, nullable=False),
    Column("mes_inicio", String, nullable=False),
    Column("mes_fim", String, nullable=False),
    Column("status", String, nullable=False),
    Column("divergencias", Text, nullable=False),
    Column("contas", Integer, nullable=False),
    Column("lancamentos", Integer, nullable=False),
    Column("hash_razao", String, nullable=False),
    Column("hash_balancete", String, nullable=False),
    Column("hash_plano", String, nullable=False),
    Column("quem", String, nullable=False),
    Column("criado_em", String, nullable=False),
    CheckConstraint("status IN ('aceita', 'recusada')", name="ck_importacao_status"),
)
Index("ix_importacao_cnpj", importacao.c.cnpj)

# Plano versionado por importação aceita: a tela usa o da importação mais recente da empresa.
plano_conta = Table(
    "plano_conta", metadata,
    Column("importacao_id", String, ForeignKey("importacao.id"), primary_key=True),
    Column("classificacao", String, primary_key=True),
    Column("reduzido", String, nullable=False),
    Column("descricao", String, nullable=False),
    Column("cnpj", String, nullable=False),
    Column("grau", Integer, nullable=False),
)

conta_mes = Table(
    "conta_mes", metadata,
    Column("cnpj", String, primary_key=True),
    Column("reduzido", String, primary_key=True),
    Column("mes", String, primary_key=True),
    Column("classificacao", String, nullable=False),
    Column("descricao", String, nullable=False),
    Column("saldo_anterior", Numeric(15, 2), nullable=False),
    Column("debito", Numeric(15, 2), nullable=False),
    Column("credito", Numeric(15, 2), nullable=False),
    Column("saldo_final", Numeric(15, 2), nullable=False),
    Column("importacao_id", String, ForeignKey("importacao.id"), nullable=False),
)

# Identidade = (cnpj, reduzido, lote_lcto): única no razão (conferido em 15.289 linhas). É o que
# deixa a reimportação manter as decisões das fases seguintes. Só a identidade é chave de upsert.
lancamento = Table(
    "lancamento", metadata,
    Column("cnpj", String, primary_key=True),
    Column("reduzido", String, primary_key=True),
    Column("lote_lcto", String, primary_key=True),
    Column("mes", String, nullable=False),
    Column("data", String, nullable=False),
    Column("historico", String, nullable=False),
    Column("contrapartida", String, nullable=False),
    Column("valor", Numeric(15, 2), nullable=False),   # D − C
    Column("importacao_id", String, ForeignKey("importacao.id"), nullable=False),
)
Index("ix_lancamento_cnpj_mes", lancamento.c.cnpj, lancamento.c.mes)

_database_url_override: str | None = None
_engine: Engine | None = None


def set_database_url(url: str) -> None:
    global _database_url_override, _engine
    _database_url_override = url
    _engine = None


def get_database_url() -> str:
    return resolver_database_url(_database_url_override, "contabil")


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = criar_engine(get_database_url(), habilitar_fk_sqlite=True)
    return _engine


def criar_schema(engine: Engine | None = None) -> None:
    """Só para testes. Em dev/produção: `python -m conta_tools_contabil migrar`."""
    metadata.create_all(engine or get_engine())
```

`src/conta_tools_contabil/migrations.py`, `alembic/env.py`, `alembic/script.py.mako`, `alembic.ini`,
`cli/_common.py`, `cli/migrar.py`, `cli/provisionar_db.py`: copiar os arquivos de mesmo nome do
`C:\dev\conta-tools-nfts` trocando `conta_tools_nfts` por `conta_tools_contabil` (e
`"conta_tools_nfts"` por `"conta_tools_contabil"` no `main_provisionar_db`). Nenhuma outra mudança.
Conferir com `grep -rn nfts src/conta_tools_contabil alembic.ini` (tem que voltar vazio).

`src/conta_tools_contabil/alembic/versions/0001_schema_inicial.py`:

```python
"""schema inicial: importacao, plano_conta, conta_mes, lancamento

Revision ID: 0001_schema_inicial
Revises:
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_schema_inicial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "importacao",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("cnpj", sa.String, nullable=False),
        sa.Column("codigo_igc", sa.String, nullable=False),
        sa.Column("empresa_nome", sa.String, nullable=False),
        sa.Column("mes_inicio", sa.String, nullable=False),
        sa.Column("mes_fim", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("divergencias", sa.Text, nullable=False),
        sa.Column("contas", sa.Integer, nullable=False),
        sa.Column("lancamentos", sa.Integer, nullable=False),
        sa.Column("hash_razao", sa.String, nullable=False),
        sa.Column("hash_balancete", sa.String, nullable=False),
        sa.Column("hash_plano", sa.String, nullable=False),
        sa.Column("quem", sa.String, nullable=False),
        sa.Column("criado_em", sa.String, nullable=False),
        sa.CheckConstraint("status IN ('aceita', 'recusada')", name="ck_importacao_status"),
    )
    op.create_index("ix_importacao_cnpj", "importacao", ["cnpj"])
    op.create_table(
        "plano_conta",
        sa.Column("importacao_id", sa.String, sa.ForeignKey("importacao.id"), primary_key=True),
        sa.Column("classificacao", sa.String, primary_key=True),
        sa.Column("reduzido", sa.String, nullable=False),
        sa.Column("descricao", sa.String, nullable=False),
        sa.Column("cnpj", sa.String, nullable=False),
        sa.Column("grau", sa.Integer, nullable=False),
    )
    op.create_table(
        "conta_mes",
        sa.Column("cnpj", sa.String, primary_key=True),
        sa.Column("reduzido", sa.String, primary_key=True),
        sa.Column("mes", sa.String, primary_key=True),
        sa.Column("classificacao", sa.String, nullable=False),
        sa.Column("descricao", sa.String, nullable=False),
        sa.Column("saldo_anterior", sa.Numeric(15, 2), nullable=False),
        sa.Column("debito", sa.Numeric(15, 2), nullable=False),
        sa.Column("credito", sa.Numeric(15, 2), nullable=False),
        sa.Column("saldo_final", sa.Numeric(15, 2), nullable=False),
        sa.Column("importacao_id", sa.String, sa.ForeignKey("importacao.id"), nullable=False),
    )
    op.create_table(
        "lancamento",
        sa.Column("cnpj", sa.String, primary_key=True),
        sa.Column("reduzido", sa.String, primary_key=True),
        sa.Column("lote_lcto", sa.String, primary_key=True),
        sa.Column("mes", sa.String, nullable=False),
        sa.Column("data", sa.String, nullable=False),
        sa.Column("historico", sa.String, nullable=False),
        sa.Column("contrapartida", sa.String, nullable=False),
        sa.Column("valor", sa.Numeric(15, 2), nullable=False),
        sa.Column("importacao_id", sa.String, sa.ForeignKey("importacao.id"), nullable=False),
    )
    op.create_index("ix_lancamento_cnpj_mes", "lancamento", ["cnpj", "mes"])


def downgrade() -> None:
    op.drop_index("ix_lancamento_cnpj_mes", "lancamento")
    op.drop_table("lancamento")
    op.drop_table("conta_mes")
    op.drop_table("plano_conta")
    op.drop_index("ix_importacao_cnpj", "importacao")
    op.drop_table("importacao")
```

`example-api.conf`:

```ini
; conta-tools-contabil: copie para api.conf e ajuste. Porta 5016, Caddy em /contabil/*.
[api]
host = 127.0.0.1
port = 5016
; prefixo do Caddy (handle_path /contabil/*); vazio em dev
root_path =

[db]
; produção: postgresql+psycopg://conta_tools_contabil_app:<senha>@localhost:5432/conta_tools_contabil
url =

[auth]
; vazio de propósito: o segredo vem da env CONTA_TOOLS_AUTH_JWT_SECRET (mesmo do conta-tools-auth)
jwt_segredo =
; sem_autenticacao = true só em dev local
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_db.py -n 0 -v`: Expected: 4 passed.
Run também: `python -m conta_tools_contabil migrar --help`: Expected: uso do argparse, sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/conta_tools_contabil/conf.py src/conta_tools_contabil/db.py src/conta_tools_contabil/migrations.py src/conta_tools_contabil/alembic src/conta_tools_contabil/cli/__init__.py src/conta_tools_contabil/cli/_common.py src/conta_tools_contabil/cli/migrar.py src/conta_tools_contabil/cli/provisionar_db.py alembic.ini example-api.conf tests/test_db.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: schema, migração inicial, conf e CLI de banco"
```

---

### Task 6: Gravação da importação

**Files:**
- Create: `src/conta_tools_contabil/importacao/gravar.py`
- Test: `tests/test_gravar.py`

**Interfaces:**
- Consumes: leitores (Task 3), `conferir`, `saldos_por_mes`, `mes_anterior`, `validar_mes` (Task 4), tabelas (Task 5).
- Produces:

```python
@dataclass
class ResultadoImportacao:
    id: str
    aceita: bool
    divergencias: list[Divergencia]
    cnpj: str
    empresa_nome: str
    contas: int
    lancamentos: int

def importar(engine, *, razao: bytes, balancete: bytes, plano: bytes,
             mes_inicio: str, mes_fim: str, quem: str) -> ResultadoImportacao
# ArquivoInvalido (de qualquer leitor) e ValueError de mês sobem para a API (vira 422).
```

Regras:
- Lê os três arquivos; saldo final anterior = `conta_mes` do `mes_anterior(mes_inicio)` daquele CNPJ (dict vazio se não houver).
- Grava sempre uma linha em `importacao` (aceita ou recusada).
- Recusada: só a linha de `importacao`. Aceita: `plano_conta`, `conta_mes` e `lancamento` na **mesma transação**.
- Reimportação de meses já gravados: `conta_mes` dos meses do período é substituído; `lancamento` é sincronizado por identidade (atualiza o que existe, insere o novo, apaga o que sumiu nos meses do período).

- [ ] **Step 1: Write the failing test** `tests/test_gravar.py`

O cenário precisa fechar como um balancete de verdade: cada lançamento do CAIXA tem o espelho numa
conta CONTRAPARTIDA (9-1), e IMOVEIS (3-5) existe só no balancete, sem movimento, com saldo credor igual
ao saldo inicial do CAIXA. Assim a soma dos saldos é zero e os débitos totais igualam os créditos.

```python
import json
from decimal import Decimal

import pytest
from igc_fixtures import tabela_html
from sqlalchemy import func, select

from conta_tools_contabil import db
from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.importacao.gravar import importar

D = Decimal
VAZIA = [""] * 8


def _br(v):
    return f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _lado(v):
    return f"{_br(v)} {'D' if v >= 0 else 'C'}"


def _bloco(conta, reduzido, nome, ant, lancs, contrapartida):
    """Bloco de uma conta no razão, com o saldo impresso acumulado (D − C) em cada linha."""
    saldo, linhas = ant, []
    for data, d, c, lote in lancs:
        saldo = saldo + d - c
        linhas.append([data, "H", "", contrapartida, lote, _br(d) if d else "", _br(c) if c else "", _br(saldo)])
    deb = sum((x[1] for x in lancs), D("0"))
    cred = sum((x[2] for x in lancs), D("0"))
    return [[f"Conta: {conta}", f"Red.: {reduzido} {nome}", "", "", "", "", "Saldo Anterior:", _br(ant)], VAZIA,
            *linhas, ["", "", "", "", "Total da Conta:", _br(deb), _br(cred), _br(saldo)]], deb, cred, saldo


def _arquivos(lancs_caixa, *, ini="01/2026", fim="02/2026", dfim="28/02/2026", ant=D("100"), nome="ACME LTDA"):
    """CAIXA (1-9) com os lançamentos [(data, débito, crédito, lote)], espelhados na CONTRAPARTIDA (9-1);
    IMOVEIS (3-5) só no balancete, sem movimento, com saldo credor igual ao do CAIXA no início."""
    espelho = [(data, c, d, "C" + lote) for data, d, c, lote in lancs_caixa]
    b1, d1, c1, s1 = _bloco("111", "1-9", "CAIXA", ant, lancs_caixa, "9-1")
    b2, d2, c2, s2 = _bloco("999", "9-1", "CONTRAPARTIDA", D("0"), espelho, "1-9")
    razao = tabela_html([
        [f"43 - {nome}", "", "", "", "", "", "Página:", "1"],
        ["Consolidação: Empresa", "", "", "", "", "", "", f"Período: 01/{ini} a {dfim}"],
        *b1, *b2,
    ])
    balancete = tabela_html([
        ["CNPJ: 07.213.542/0001-91"],
        ["Consolidação: Empresa", "Período:", f"{ini} a {fim}"],
        ["1.1", "1-9", "CAIXA", "", _lado(ant), _br(d1), _br(c1), _lado(s1)],
        ["1.2", "3-5", "IMOVEIS", "", _lado(-ant), "0,00", "0,00", _lado(-ant)],
        ["9.9", "9-1", "CONTRAPARTIDA", "", "0,00", _br(d2), _br(c2), _lado(s2)],
        ["", "", "TOTAL GERAL", "", "0,00", _br(d1 + d2), _br(c1 + c2), "0,00"],
    ])
    plano = tabela_html([
        [nome], ["Classificação", "Código", "Descrição", "CNPJ Cliente/Fornecedor", "Grau", "Tipo"],
        ["1.1", "1-9", "CAIXA", "", "5", ""], ["1.2", "3-5", "IMOVEIS", "", "5", ""],
        ["9.9", "9-1", "CONTRAPARTIDA", "", "5", ""],
    ])
    return razao, balancete, plano
```

Testes, no mesmo arquivo, abaixo dos helpers:

```python
JAN = [("05/01/2026", D("50"), D("0"), "1/1"), ("20/01/2026", D("0"), D("10"), "1/2")]
FEV = [("03/02/2026", D("0"), D("20"), "1/3")]


@pytest.fixture
def engine():
    db.set_database_url("sqlite:///:memory:")
    e = db.get_engine()
    db.criar_schema(e)
    return e


def _contar(engine, tabela):
    with engine.connect() as c:
        return c.execute(select(func.count()).select_from(tabela)).scalar()


def _importar(engine, arquivos, ini="2026-01", fim="2026-02"):
    razao, balancete, plano = arquivos
    return importar(engine, razao=razao, balancete=balancete, plano=plano, mes_inicio=ini, mes_fim=fim, quem="ana")


def test_importacao_aceita_grava_meses_e_lancamentos(engine):
    r = _importar(engine, _arquivos(JAN + FEV))
    assert r.aceita and r.divergencias == []
    assert (r.cnpj, r.contas, r.lancamentos) == ("07213542000191", 3, 6)
    with engine.connect() as c:
        cm = {(x.reduzido, x.mes): x for x in c.execute(select(db.conta_mes))}
    assert len(cm) == 6   # 3 contas x 2 meses
    assert cm["1-9", "2026-01"].saldo_final == D("140")
    assert cm["1-9", "2026-02"].saldo_anterior == D("140")
    assert cm["1-9", "2026-02"].saldo_final == D("120")
    assert _contar(engine, db.lancamento) == 6
    assert _contar(engine, db.plano_conta) == 3


def test_importacao_recusada_nao_grava_dado(engine):
    r = _importar(engine, _arquivos(JAN + FEV), ini="2026-02")   # período errado
    assert not r.aceita
    assert {d.conferencia for d in r.divergencias} == {"periodo"}
    assert _contar(engine, db.importacao) == 1
    assert _contar(engine, db.conta_mes) == _contar(engine, db.lancamento) == _contar(engine, db.plano_conta) == 0
    with engine.connect() as c:
        linha = c.execute(select(db.importacao)).one()
    assert linha.status == "recusada"
    assert json.loads(linha.divergencias)[0]["conferencia"] == "periodo"


def test_reimportar_apaga_o_que_sumiu_e_mantem_identidade(engine):
    _importar(engine, _arquivos(JAN + FEV))
    r = _importar(engine, _arquivos(JAN[:1] + FEV))   # o 1/2 de janeiro sumiu do IGC
    assert r.aceita
    with engine.connect() as c:
        lotes = {x.lote_lcto for x in c.execute(select(db.lancamento).where(db.lancamento.c.reduzido == "1-9"))}
        cm = c.execute(select(db.conta_mes).where(db.conta_mes.c.reduzido == "1-9", db.conta_mes.c.mes == "2026-01")).one()
    assert lotes == {"1/1", "1/3"}
    assert cm.saldo_final == D("150")
    assert _contar(engine, db.conta_mes) == 6   # substituído, não duplicado


def test_mes_seguinte_confere_saldo_anterior_com_o_gravado(engine):
    _importar(engine, _arquivos(JAN, fim="01/2026", dfim="31/01/2026"), fim="2026-01")
    # março começa com saldo 999, mas janeiro terminou em 140: fevereiro não foi importado,
    # então não há mês anterior gravado para março -> aceita
    marco = [("03/03/2026", D("0"), D("20"), "1/9")]
    ok = _importar(engine, _arquivos(marco, ini="03/2026", fim="03/2026", dfim="31/03/2026", ant=D("999")), "2026-03", "2026-03")
    assert ok.aceita
    # fevereiro começa com 999, mas janeiro gravado terminou em 140 -> recusa
    r = _importar(engine, _arquivos([("03/02/2026", D("0"), D("20"), "1/3")], ini="02/2026", fim="02/2026", dfim="28/02/2026", ant=D("999")), "2026-02", "2026-02")
    assert not r.aceita
    assert {d.conferencia for d in r.divergencias} == {"saldo_anterior"}


def test_arquivo_trocado_levanta_dizendo_qual(engine):
    razao, balancete, plano = _arquivos(JAN + FEV)
    with pytest.raises(ArquivoInvalido, match="razão"):
        importar(engine, razao=balancete, balancete=balancete, plano=plano, mes_inicio="2026-01", mes_fim="2026-02", quem="ana")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_gravar.py -n 0 -v`: Expected: FAIL (`ModuleNotFoundError: ...gravar`).

- [ ] **Step 3: Write implementation** `src/conta_tools_contabil/importacao/gravar.py`

```python
"""Grava a importação: tudo na mesma transação, e só se a conferência não achou divergência."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Engine, delete, select, tuple_

from conta_tools_contabil import db
from conta_tools_contabil.igc.balancete import ler_balancete
from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.igc.plano import ler_plano
from conta_tools_contabil.igc.razao import ler_razao
from conta_tools_contabil.importacao.conferencias import Divergencia, conferir, saldos_por_mes
from conta_tools_contabil.importacao.periodo import mes_anterior, meses_do_periodo, validar_mes


@dataclass
class ResultadoImportacao:
    id: str
    aceita: bool
    divergencias: list[Divergencia]
    cnpj: str
    empresa_nome: str
    contas: int
    lancamentos: int


def _ler(nome: str, funcao, conteudo: bytes):
    try:
        return funcao(conteudo)
    except ArquivoInvalido as e:
        raise ArquivoInvalido(f"arquivo do {nome}: {e}") from e


def importar(
    engine: Engine, *, razao: bytes, balancete: bytes, plano: bytes, mes_inicio: str, mes_fim: str, quem: str,
) -> ResultadoImportacao:
    validar_mes(mes_inicio)
    validar_mes(mes_fim)
    meses = meses_do_periodo(mes_inicio, mes_fim)
    r = _ler("razão", ler_razao, razao)
    b = _ler("balancete", ler_balancete, balancete)
    p = _ler("plano de contas", ler_plano, plano)

    with engine.begin() as conn:
        anterior = {
            x.reduzido: Decimal(x.saldo_final)
            for x in conn.execute(select(db.conta_mes.c.reduzido, db.conta_mes.c.saldo_final).where(
                db.conta_mes.c.cnpj == b.cnpj, db.conta_mes.c.mes == mes_anterior(mes_inicio)))
        }
        divergencias = conferir(r, b, p, mes_inicio=mes_inicio, mes_fim=mes_fim, saldo_final_anterior=anterior)
        aceita = not divergencias
        imp_id = str(uuid.uuid4())
        n_lanc = sum(len(c.lancamentos) for c in r.contas)
        conn.execute(db.importacao.insert().values(
            id=imp_id, cnpj=b.cnpj, codigo_igc=r.codigo_igc, empresa_nome=r.empresa_nome,
            mes_inicio=mes_inicio, mes_fim=mes_fim, status="aceita" if aceita else "recusada",
            divergencias=json.dumps([asdict(d) for d in divergencias], ensure_ascii=False),
            contas=len(b.linhas), lancamentos=n_lanc,
            hash_razao=hashlib.sha256(razao).hexdigest(), hash_balancete=hashlib.sha256(balancete).hexdigest(),
            hash_plano=hashlib.sha256(plano).hexdigest(),
            quem=quem, criado_em=datetime.now().isoformat(timespec="seconds"),
        ))
        if aceita:
            _gravar_dados(conn, imp_id, b.cnpj, r, b, p, meses, mes_inicio, mes_fim)

    return ResultadoImportacao(imp_id, aceita, divergencias, b.cnpj, r.empresa_nome, len(b.linhas), n_lanc)


def _gravar_dados(conn, imp_id, cnpj, r, b, p, meses, mes_inicio, mes_fim) -> None:
    conn.execute(db.plano_conta.insert(), [
        {"importacao_id": imp_id, "classificacao": c.classificacao, "reduzido": c.reduzido,
         "descricao": c.descricao, "cnpj": c.cnpj, "grau": c.grau}
        for c in p.contas
    ])

    bal = {x.reduzido: x for x in b.linhas}
    conn.execute(delete(db.conta_mes).where(db.conta_mes.c.cnpj == cnpj, db.conta_mes.c.mes.in_(meses)))
    conn.execute(db.conta_mes.insert(), [
        {"cnpj": cnpj, "reduzido": s.reduzido, "mes": s.mes, "classificacao": bal[s.reduzido].classificacao,
         "descricao": bal[s.reduzido].descricao, "saldo_anterior": s.saldo_anterior, "debito": s.debito,
         "credito": s.credito, "saldo_final": s.saldo_final, "importacao_id": imp_id}
        for s in saldos_por_mes(r, b, mes_inicio=mes_inicio, mes_fim=mes_fim)
    ])

    # lançamentos: sincroniza por identidade (cnpj, reduzido, lote_lcto) nos meses do período
    novos = {
        (cnpj, c.reduzido, l.lote_lcto): {
            "cnpj": cnpj, "reduzido": c.reduzido, "lote_lcto": l.lote_lcto, "mes": f"{l.data:%Y-%m}",
            "data": l.data.isoformat(), "historico": l.historico, "contrapartida": l.contrapartida,
            "valor": l.debito - l.credito, "importacao_id": imp_id,
        }
        for c in r.contas for l in c.lancamentos
    }
    t = db.lancamento
    existentes = {
        (x.cnpj, x.reduzido, x.lote_lcto)
        for x in conn.execute(select(t.c.cnpj, t.c.reduzido, t.c.lote_lcto).where(t.c.cnpj == cnpj, t.c.mes.in_(meses)))
    }
    sumiram = existentes - novos.keys()
    if sumiram:
        conn.execute(delete(t).where(tuple_(t.c.cnpj, t.c.reduzido, t.c.lote_lcto).in_(list(sumiram))))
    for chave in existentes & novos.keys():
        valores = {k: v for k, v in novos[chave].items() if k not in ("cnpj", "reduzido", "lote_lcto")}
        conn.execute(t.update().where(t.c.cnpj == chave[0], t.c.reduzido == chave[1], t.c.lote_lcto == chave[2]).values(**valores))
    a_inserir = [novos[k] for k in novos.keys() - existentes]
    if a_inserir:
        conn.execute(t.insert(), a_inserir)
```

> `tuple_(...).in_` com muitas chaves: o SQLite aceita até 32.766 parâmetros por consulta e o Postgres
> não tem limite prático; a importação real tem 15.289 lançamentos, então o caso extremo (todos
> sumirem) passa nos dois. ponytail: se um dia passar disso, apagar em lotes de 5.000.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_gravar.py -n 0 -v`: Expected: 5 passed.

- [ ] **Step 5: Teste com os arquivos reais** (acrescentar em `tests/test_arquivos_reais.py`)

```python
def test_importacao_real_em_sqlite():
    from sqlalchemy import func, select

    from conta_tools_contabil import db
    from conta_tools_contabil.importacao.gravar import importar

    db.set_database_url("sqlite:///:memory:")
    e = db.get_engine()
    db.criar_schema(e)
    r = importar(e, razao=RAZAO.read_bytes(), balancete=BALANCETE.read_bytes(), plano=PLANO.read_bytes(),
                 mes_inicio="2026-01", mes_fim="2026-07", quem="teste")
    assert r.aceita, r.divergencias[:5]
    with e.connect() as c:
        assert c.execute(select(func.count()).select_from(db.lancamento)).scalar() == 15289
        assert c.execute(select(func.count()).select_from(db.conta_mes)).scalar() == 378 * 7
```

Run: `python -m pytest tests/test_arquivos_reais.py -n 0 -v`: Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/conta_tools_contabil/importacao/gravar.py tests/test_gravar.py tests/test_arquivos_reais.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: gravação da importação por mês, sincronizando lançamentos por identidade"
```

---

### Task 7: Autorização, API, tela de importação e `serve`

**Files:**
- Create: `src/conta_tools_contabil/autorizacao.py`, `src/conta_tools_contabil/api/__init__.py` (vazio), `api/app.py`, `api/static/nav.js`, `api/static/importacao.html`
- Create: `src/conta_tools_contabil/cli/serve.py`, `docs/ACESSOS.md`
- Create: `tests/conftest.py`, `tests/helpers_app.py`
- Test: `tests/test_api.py`, `tests/test_http_auth_sweep.py`, `tests/test_nav_menu.py`

**Interfaces:**
- Consumes: `importar`, `ResultadoImportacao` (Task 6), `ApiConf` (Task 5), `db` (Task 5).
- Produces:
  - `autorizacao.configurar(jwt_segredo: str)`, `exigir(modulo, papel_minimo)`, `exigir_sessao()`, `papeis_do_pedido`, `quem_do_pedido`, `esta_ligada()`, `SISTEMA`, `_MODULOS_VALIDOS = {"conciliacao", "ia"}`
  - `create_app(api_conf: ApiConf) -> FastAPI`
  - Rotas: `GET /version`, `GET /status`, `GET /nav.js`, `GET /me/papeis` (públicas ou sem dependency), `GET /` (tela, sessão), `POST /importacoes` (`conciliacao:operador`), `GET /importacoes` (`conciliacao:leitura`)

- [ ] **Step 1: `autorizacao.py`**: copiar `C:\dev\conta-tools-nfts\src\conta_tools_nfts\autorizacao.py` e aplicar exatamente estas mudanças:
  1. Docstring do módulo: "Autorização do conta-tools-contabil: pessoa com token do conta-tools-auth (header ou cookie), papel por módulo. Não há chave de serviço nesta fase: nenhum serviço chama o contabil."
  2. `SISTEMA = "conta-tools-contabil"`; `_MODULOS_VALIDOS = frozenset({"conciliacao", "ia"})`.
  3. Remover `_servicos`, `_servicos_chaves`, `_rota_do_pedido`, `_servico_do_pedido` e o bloco de serviço dentro de `_checar_credencial`.
  4. `configurar(jwt_segredo: str) -> None` (só o segredo; mantém o `logger.warning` do modo dev).
  5. Acrescentar no fim:

```python
def quem_do_pedido(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    contatools_token: str | None = Cookie(default=None, alias=COOKIE_NOME),
) -> str:
    """Nome de quem fez o pedido, para o registro da importação. Modo dev: "local"."""
    if not _jwt_segredo:
        return "local"
    autorizacao_header = f"Bearer {credentials.credentials}" if credentials else None
    bruto = extrair_bearer(autorizacao_header, contatools_token)
    payload = verificar_token_assinado(bruto, _jwt_segredo) if bruto else None
    payload = payload or {}
    return str(payload.get("nome") or payload.get("email") or payload.get("usuario_id") or "desconhecido")
```

- [ ] **Step 2: Write the failing tests**

`tests/conftest.py`:

```python
import pytest

from conta_tools_contabil import autorizacao


@pytest.fixture(autouse=True)
def _resetar_autorizacao():
    """`autorizacao` guarda o segredo em global de módulo: sem reset, um teste com auth ligada
    vazaria para os seguintes."""
    autorizacao.configurar(jwt_segredo="")
```

`tests/helpers_app.py`:

```python
from conta_tools_contabil import db
from conta_tools_contabil.api.app import create_app
from conta_tools_contabil.conf import ApiConf


def app_de_teste(*, segredo: str = "", root_path: str = ""):
    db.set_database_url("sqlite:///:memory:")
    db.criar_schema(db.get_engine())
    return create_app(ApiConf(auth_jwt_segredo=segredo, root_path=root_path))
```

`tests/test_api.py`:

```python
import asyncio
import threading
from decimal import Decimal

from fastapi.testclient import TestClient
from helpers_app import app_de_teste
from test_gravar import FEV, JAN, _arquivos

D = Decimal


def _post(client, arquivos, ini="2026-01", fim="2026-02"):
    razao, balancete, plano = arquivos
    return client.post("/importacoes", data={"mes_inicio": ini, "mes_fim": fim}, files={
        "razao": ("razao.xls", razao), "balancete": ("balancete.xls", balancete), "plano": ("plano.xls", plano),
    })


def test_version_e_status():
    c = TestClient(app_de_teste())
    assert c.get("/version").json()["version"]
    s = c.get("/status").json()
    assert s["alive"] is True and s["banco_ok"] is True and s["auth_ligada"] is False


def test_importacao_aceita_aparece_na_lista():
    c = TestClient(app_de_teste())
    r = _post(c, _arquivos(JAN + FEV))
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["aceita"] is True and corpo["lancamentos"] == 6 and corpo["divergencias"] == []
    [linha] = c.get("/importacoes").json()
    assert (linha["status"], linha["quem"], linha["cnpj"]) == ("aceita", "local", "07213542000191")


def test_importacao_recusada_devolve_divergencias():
    c = TestClient(app_de_teste())
    corpo = _post(c, _arquivos(JAN + FEV), ini="2026-02").json()
    assert corpo["aceita"] is False
    assert corpo["divergencias"][0]["conferencia"] == "periodo"


def test_arquivo_trocado_e_mes_invalido_viram_422():
    c = TestClient(app_de_teste())
    razao, balancete, plano = _arquivos(JAN + FEV)
    r = _post(c, (balancete, balancete, plano))
    assert r.status_code == 422 and "razão" in r.json()["detail"]
    assert _post(c, _arquivos(JAN + FEV), ini="01/2026").status_code == 422


def test_importacao_roda_fora_da_thread_do_event_loop(monkeypatch):
    """Convenção do ecossistema: handler async não chama trabalho síncrono pesado direto
    (importação de 17 MB). TestClient não serve para isto: chama a corrotina direto."""
    from conta_tools_contabil.api import app as app_mod

    thread_do_loop = threading.current_thread()
    usadas = []

    def _falso(*a, **k):
        usadas.append(threading.current_thread())
        from conta_tools_contabil.importacao.gravar import ResultadoImportacao
        return ResultadoImportacao("x", True, [], "1", "E", 0, 0)

    monkeypatch.setattr(app_mod, "importar", _falso)
    app = app_de_teste()
    handler = next(r.endpoint for r in app.routes if getattr(r, "path", "") == "/importacoes" and "POST" in r.methods)

    class _Arq:
        def __init__(self):
            self.filename = "x.xls"

        async def read(self):
            return b""

    asyncio.run(handler(razao=_Arq(), balancete=_Arq(), plano=_Arq(), mes_inicio="2026-01", mes_fim="2026-01", quem="t"))
    assert usadas and usadas[0] is not thread_do_loop


def test_tela_de_importacao_carrega_nav_e_nao_tem_cinza():
    c = TestClient(app_de_teste())
    html = c.get("/").text
    assert '<script src="nav.js"></script>' in html and "montarNavLinks('importacao')" in html
    for cinza in ("#888", "#999", "#666", "#777", "gray", "grey"):
        assert cinza not in html.lower()
    assert c.get("/nav.js").status_code == 200
```

`tests/test_http_auth_sweep.py`:

```python
from conta_tools_shared.auth.cookie import COOKIE_NOME
from conta_tools_shared.auth.token import emitir
from conta_tools_shared.testing import assert_rotas_protegidas, assert_tela_exige_sessao
from fastapi.testclient import TestClient
from helpers_app import app_de_teste

_ISENTAS = {"/version", "/status", "/nav.js"}
SEGREDO = "segredo-de-teste"


def _token(papeis):
    return emitir({"usuario_id": 1, "papeis": papeis, "versao": 1, "nome": "Ana"}, SEGREDO, ttl_segundos=600)


def test_isentas_sao_exatamente_estas():
    assert _ISENTAS == {"/version", "/status", "/nav.js"}


def test_todas_rotas_autenticadas_rejeitam_sem_token():
    # /me/papeis devolve {} sem credencial por contrato (o menu distingue "sem papel" de erro)
    assert_rotas_protegidas(app_de_teste(segredo=SEGREDO), isentas=_ISENTAS | {"/me/papeis"})


def test_tela_exige_sessao():
    tok = _token({"conta-tools-outro.x": "leitura"})
    assert_tela_exige_sessao(
        app_de_teste(segredo=SEGREDO, root_path="/prefixo"), "/",
        {"Authorization": f"Bearer {tok}"}, cookies_sem_papel={COOKIE_NOME: tok},
    )


def test_leitura_nao_importa_e_operador_importa():
    from test_api import _post
    from test_gravar import FEV, JAN, _arquivos

    app = app_de_teste(segredo=SEGREDO)
    leitor = TestClient(app, headers={"Authorization": f"Bearer {_token({'conta-tools-contabil.conciliacao': 'leitura'})}"})
    assert leitor.get("/importacoes").status_code == 200
    assert _post(leitor, _arquivos(JAN + FEV)).status_code == 403
    operador = TestClient(app, headers={"Authorization": f"Bearer {_token({'conta-tools-contabil.conciliacao': 'operador'})}"})
    assert _post(operador, _arquivos(JAN + FEV)).json()["aceita"] is True
    assert operador.get("/importacoes").json()[0]["quem"] == "Ana"
```

`tests/test_nav_menu.py`:

```python
import re
from pathlib import Path

from conta_tools_contabil import autorizacao

_STATIC = Path(__file__).resolve().parents[1] / "src" / "conta_tools_contabil" / "api" / "static"


def test_modulo_de_item_de_menu_existe():
    modulos = set(re.findall(r"modulo: '([^']+)'", (_STATIC / "nav.js").read_text(encoding="utf-8")))
    assert modulos and modulos <= autorizacao._MODULOS_VALIDOS


def test_toda_pagina_carrega_nav_e_monta_o_menu():
    for pagina in _STATIC.glob("*.html"):
        fonte = pagina.read_text(encoding="utf-8")
        assert '<script src="nav.js"></script>' in fonte, pagina.name
        assert "montarNavLinks(" in fonte, pagina.name
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_api.py tests/test_http_auth_sweep.py tests/test_nav_menu.py -n 0 -v`
Expected: FAIL (`ModuleNotFoundError: conta_tools_contabil.api`).

- [ ] **Step 4: Write implementation**

`src/conta_tools_contabil/api/app.py`:

```python
"""API HTTP do conta-tools-contabil."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from conta_tools_shared.auth.tela import instalar_redirect_de_tela
from conta_tools_shared.seguranca import adicionar_headers_seguranca
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from starlette.middleware.gzip import GZipMiddleware

from conta_tools_contabil import autorizacao, db
from conta_tools_contabil.conf import ApiConf
from conta_tools_contabil.igc.html import ArquivoInvalido
from conta_tools_contabil.importacao.gravar import importar

_STATIC = Path(__file__).parent / "static"
_PACOTE = "conta-tools-contabil"

_SEM_ACESSO_HTML = """<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Sem acesso: Conciliação contábil</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1f2430">
<h1>Você não tem acesso a este sistema</h1>
<p>Sua sessão é válida, mas seu usuário não tem papel em <code>conta-tools-contabil</code>.
Peça a quem administra os acessos o papel <code>conciliacao:leitura</code> (ver) ou
<code>conciliacao:operador</code> (importar e conciliar).</p>
</body></html>
"""


def create_app(api_conf: ApiConf) -> FastAPI:
    autorizacao.configurar(jwt_segredo=api_conf.auth_jwt_segredo)
    engine = db.get_engine()
    from conta_tools_shared.migracao import avisar_migracao_pendente

    migracao_pendente = avisar_migracao_pendente(
        "conta_tools_contabil", engine, "python -m conta_tools_contabil migrar"
    )

    app = FastAPI(title="ContaTools Contábil", docs_url=None, redoc_url=None, openapi_url=None)
    adicionar_headers_seguranca(app)
    app.add_middleware(GZipMiddleware, minimum_size=500)

    def _dep(modulo: str, papel: str):
        return [Depends(autorizacao.exigir(modulo, papel))]

    _SESSAO = [Depends(autorizacao.exigir_sessao())]

    @app.get("/version", include_in_schema=False)
    def get_version():
        from importlib.metadata import version as pkg_version
        return {"version": pkg_version(_PACOTE)}

    @app.get("/status", include_in_schema=False)
    def get_status(request: Request):
        from conta_tools_shared.status import build_status

        # toca o recurso real: banco fora do ar tem que aparecer no monitor
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            banco_ok, erro = True, None
        except Exception as e:  # noqa: BLE001
            banco_ok, erro = False, f"banco indisponível: {e.__class__.__name__}"
        return {
            **build_status(last_run_ok=banco_ok if not banco_ok else None, last_error=erro, pacote=_PACOTE),
            "banco_ok": banco_ok,
            "migracao_pendente": migracao_pendente,
            "auth_ligada": autorizacao.esta_ligada(),
            "root_path": request.scope.get("root_path", ""),
        }

    @app.get("/me/papeis", include_in_schema=False)
    def me_papeis(papeis: dict = Depends(autorizacao.papeis_do_pedido)):
        return papeis

    @app.get("/nav.js", include_in_schema=False)
    def nav_js():
        return Response((_STATIC / "nav.js").read_text(encoding="utf-8"), media_type="application/javascript")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False, dependencies=_SESSAO)
    def tela_importacao():
        return HTMLResponse((_STATIC / "importacao.html").read_text(encoding="utf-8"))

    @app.post("/importacoes", dependencies=_dep("conciliacao", "operador"))
    async def post_importacao(
        razao: UploadFile = File(...),
        balancete: UploadFile = File(...),
        plano: UploadFile = File(...),
        mes_inicio: str = Form(...),
        mes_fim: str = Form(...),
        quem: str = Depends(autorizacao.quem_do_pedido),
    ):
        conteudos = [await razao.read(), await balancete.read(), await plano.read()]
        try:
            # importação de 17 MB é pesada: fora do event loop (convenção do ecossistema)
            r = await asyncio.to_thread(
                importar, engine, razao=conteudos[0], balancete=conteudos[1], plano=conteudos[2],
                mes_inicio=mes_inicio, mes_fim=mes_fim, quem=quem,
            )
        except (ArquivoInvalido, ValueError) as e:
            raise HTTPException(status_code=422, detail=str(e))
        return {
            "id": r.id, "aceita": r.aceita, "cnpj": r.cnpj, "empresa_nome": r.empresa_nome,
            "contas": r.contas, "lancamentos": r.lancamentos,
            "divergencias": [d.__dict__ for d in r.divergencias],
        }

    @app.get("/importacoes", dependencies=_dep("conciliacao", "leitura"))
    def get_importacoes():
        t = db.importacao
        with engine.connect() as conn:
            linhas = conn.execute(select(t).order_by(t.c.criado_em.desc()).limit(200)).mappings().all()
        return [
            {**{k: v for k, v in linha.items() if k not in ("divergencias", "hash_razao", "hash_balancete", "hash_plano")},
             "divergencias": json.loads(linha["divergencias"])}
            for linha in linhas
        ]

    # depois de todas as rotas: varre app.routes no momento da chamada
    app.state.rotas_tela = instalar_redirect_de_tela(app, _SESSAO, sem_acesso_html=_SEM_ACESSO_HTML)
    return app
```

> O teste `test_importacao_roda_fora_da_thread_do_event_loop` chama o handler passando `quem=` direto,
> e `importar` é lido do módulo (`app_mod.importar`) no momento da chamada: por isso o handler usa o
> nome `importar` importado no topo do módulo, e o `monkeypatch.setattr(app_mod, "importar", ...)` vale.

`src/conta_tools_contabil/api/static/nav.js`: copiar `C:\dev\conta-tools-nfts\src\conta_tools_nfts\api\static\nav.js` trocando só:

```js
const _SISTEMA = 'conta-tools-contabil';
// ...
const NAV_ITEMS = [
  { id: 'importacao', href: '.', label: 'Importar do IGC', modulo: 'conciliacao' },
];
```

`src/conta_tools_contabil/api/static/importacao.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conciliação contábil · Importar do IGC</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 13px; background: #f5f6f8; color: #1f2430; }
  header { background: #1a3c5e; color: #fff; padding: 11px 20px; display: flex; align-items: center; gap: 16px; position: relative; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .version { font-size: 11px; color: rgba(255,255,255,.35); margin-left: auto; }
  .hamburger { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 5px; color: #fff; flex: none; }
  .hamburger:hover { background: rgba(255,255,255,.12); }
  .hamburger svg { width: 16px; height: 16px; }
  #auth-painel { display: none; position: absolute; top: 46px; left: 8px; z-index: 30; background: #fff; color: #1f2430; border: 1px solid #d3d7de; border-radius: 8px; min-width: 230px; box-shadow: 0 8px 24px rgba(0,0,0,.16); padding: 14px; }
  #auth-painel.aberto { display: block; }
  #auth-painel .nav-links { display: flex; flex-direction: column; gap: 2px; }
  #auth-painel .nav-links a { display: flex; align-items: center; gap: 9px; padding: 8px; font-size: 13px; border-radius: 6px; text-decoration: none; color: #1f2430; }
  #auth-painel .nav-links a:hover { background: #eef3f8; }
  #auth-painel .nav-links a.atual { color: #1a3c5e; font-weight: 600; }
  #auth-painel .nav-links a .dot { width: 6px; height: 6px; border-radius: 50%; background: #c2c7d0; flex: none; }
  #auth-painel .nav-links a.atual .dot { background: #1a3c5e; }
  main { max-width: 980px; margin: 20px auto; padding: 0 16px; }
  .cartao { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); padding: 16px 18px; margin-bottom: 16px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #1a3c5e; }
  .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px 18px; }
  label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  input[type=file], input[type=month] { width: 100%; padding: 5px; border: 1px solid #c9d2dc; border-radius: 4px; background: #fff; color: #1f2430; font-size: 13px; }
  button.principal { margin-top: 14px; padding: 7px 16px; border: none; border-radius: 4px; background: #2e7d32; color: #fff; font-weight: 600; cursor: pointer; }
  button.principal:disabled { opacity: .5; cursor: wait; }
  .ok { border-left: 4px solid #2e7d32; background: #e8f5e9; padding: 10px 12px; border-radius: 6px; font-weight: 600; }
  .recusa { border-left: 4px solid #c62828; background: #fdecea; padding: 10px 12px; border-radius: 6px; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eef0f3; font-size: 12px; color: #1f2430; }
  th { background: #f0f2f5; }
</style>
</head>
<body>
<header>
  <button class="hamburger" id="btn-menu" aria-label="Menu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <div id="auth-painel"><div class="nav-links"></div></div>
  <h1>Conciliação contábil · Importar do IGC</h1>
  <span class="version" id="app-version"></span>
</header>
<main>
  <div class="cartao">
    <h2>Importar razão, balancete e plano de contas</h2>
    <form id="form">
      <div class="campos">
        <div><label for="razao">Razão (RAZAO - ….xls)</label><input type="file" id="razao" name="razao" accept=".xls,.htm,.html" required></div>
        <div><label for="balancete">Balancete do mesmo período</label><input type="file" id="balancete" name="balancete" accept=".xls,.htm,.html" required></div>
        <div><label for="plano">Plano de contas</label><input type="file" id="plano" name="plano" accept=".xls,.htm,.html" required></div>
        <div><label for="mes_inicio">Mês inicial</label><input type="month" id="mes_inicio" name="mes_inicio" required></div>
        <div><label for="mes_fim">Mês final</label><input type="month" id="mes_fim" name="mes_fim" required></div>
      </div>
      <button class="principal" id="enviar" type="submit">Importar e conferir</button>
    </form>
    <div id="resultado" style="margin-top:14px"></div>
  </div>
  <div class="cartao">
    <h2>Importações</h2>
    <div id="lista">Carregando…</div>
  </div>
</main>
<script src="nav.js"></script>
<script>
montarNavLinks('importacao');
fetch('version').then(r => r.json()).then(d => { document.getElementById('app-version').textContent = 'v' + d.version; }).catch(() => {});
document.getElementById('btn-menu').addEventListener('click', e => { e.stopPropagation(); document.getElementById('auth-painel').classList.toggle('aberto'); });
document.addEventListener('click', () => document.getElementById('auth-painel').classList.remove('aberto'));
document.getElementById('auth-painel').addEventListener('click', e => e.stopPropagation());

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtCnpj = c => /^[0-9A-Z]{14}$/.test(c) ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : c;
const fmtMes = m => m ? m.slice(5) + '/' + m.slice(0, 4) : '';

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const botao = document.getElementById('enviar'), saida = document.getElementById('resultado');
  botao.disabled = true; botao.textContent = 'Conferindo…'; saida.innerHTML = '';
  try {
    const resp = await contaToolsFetch('importacoes', { method: 'POST', body: new FormData(e.target) });
    const corpo = await resp.json();
    if (!resp.ok) { saida.innerHTML = `<div class="recusa">${esc(corpo.detail || 'Erro ao importar')}</div>`; return; }
    saida.innerHTML = corpo.aceita
      ? `<div class="ok">✓ Importação aceita: ${esc(corpo.empresa_nome)} (${fmtCnpj(corpo.cnpj)}), ${corpo.contas} contas, ${corpo.lancamentos} lançamentos.</div>`
      : `<div class="recusa">Importação recusada: ${corpo.divergencias.length} divergência(s). Nada foi gravado.</div>
         <table><tr><th>Conferência</th><th>Conta</th><th>O que não bateu</th></tr>
         ${corpo.divergencias.map(d => `<tr><td>${esc(d.conferencia)}</td><td>${esc(d.reduzido || '')}</td><td>${esc(d.mensagem)}</td></tr>`).join('')}</table>`;
    carregarLista();
  } finally {
    botao.disabled = false; botao.textContent = 'Importar e conferir';
  }
});

async function carregarLista() {
  const resp = await contaToolsFetch('importacoes');
  const linhas = resp.ok ? await resp.json() : [];
  document.getElementById('lista').innerHTML = linhas.length
    ? `<table><tr><th>Quando</th><th>Quem</th><th>Empresa</th><th>CNPJ</th><th>Período</th><th>Resultado</th></tr>
       ${linhas.map(l => `<tr><td>${esc(l.criado_em.replace('T', ' ').slice(0, 16))}</td><td>${esc(l.quem)}</td><td>${esc(l.empresa_nome)}</td>
         <td>${fmtCnpj(l.cnpj)}</td><td>${fmtMes(l.mes_inicio)} a ${fmtMes(l.mes_fim)}</td>
         <td>${l.status === 'aceita' ? `✓ aceita (${l.lancamentos} lançamentos)` : `recusada (${l.divergencias.length} divergências)`}</td></tr>`).join('')}</table>`
    : 'Nenhuma importação ainda.';
}
carregarLista();
</script>
</body>
</html>
```

`src/conta_tools_contabil/cli/serve.py`:

```python
"""CLI: python -m conta_tools_contabil serve --conf api.conf"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main_serve(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="conta_tools_contabil serve")
    parser.add_argument("--conf", type=Path, default=Path("api.conf"))
    args = parser.parse_args(argv)
    try:
        from conta_tools_shared.auth.arranque import exigir_autenticacao, sem_autenticacao_declarado

        from conta_tools_contabil import db
        from conta_tools_contabil.conf import carregar_api_conf

        api_conf = carregar_api_conf(args.conf)
        # recusa subir com RBAC desligado por descuido (aqui, e não no conf: migrar não precisa do segredo)
        exigir_autenticacao(api_conf.auth_jwt_segredo, sem_autenticacao_declarado(args.conf),
                            servico="conta-tools-contabil")
        if api_conf.db_url:
            db.set_database_url(api_conf.db_url)
        from conta_tools_contabil.api.app import create_app

        app = create_app(api_conf)
    except (ValueError, FileNotFoundError) as e:
        print(f"Erro ao ler {args.conf}: {e}", file=sys.stderr)
        return 1

    import uvicorn
    from conta_tools_shared.logging import formatter as log
    from conta_tools_shared.logging.uvicorn_config import uvicorn_log_config

    log.log_info(f"ContaTools Contábil API: http://{api_conf.host}:{api_conf.port}")
    uvicorn.run(app, host=api_conf.host, port=api_conf.port, log_level="warning",
                log_config=uvicorn_log_config(), root_path=api_conf.root_path)
    return 0
```

`docs/ACESSOS.md`:

```markdown
# Acessos: conta-tools-contabil

Sistema no conta-tools-auth: `conta-tools-contabil`. Papéis: `leitura` < `operador` < `responsavel`.
Acesso por módulo: quem tem o módulo vê todas as empresas (não existe filtro por empresa).
Atualizar no MESMO commit de qualquer rota ou tela que ganhe ou mude controle de acesso.

| Tela UI | Endpoint(s) | Módulo | Papel mínimo |
|---|---|---|---|
| Importar do IGC (`/`) | `GET /` | qualquer papel no sistema | sessão |
| Importar do IGC | `POST /importacoes` | `conciliacao` | `operador` |
| Importar do IGC | `GET /importacoes` | `conciliacao` | `leitura` |
| - | `GET /version`, `GET /status`, `GET /nav.js` | público | - |
| - | `GET /me/papeis` | sem credencial devolve `{}` | - |
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_api.py tests/test_http_auth_sweep.py tests/test_nav_menu.py -n 0 -v`
Expected: all passed.

- [ ] **Step 6: Teste manual da tela**

```bash
cd /c/dev/conta-tools-contabil
printf '[api]\nport = 5016\n[auth]\nsem_autenticacao = true\n' > "$TEMP/contabil-dev.conf"
python -m conta_tools_contabil serve --conf "$TEMP/contabil-dev.conf"   # em segundo plano
```

Abrir `http://127.0.0.1:5016/`, importar os três arquivos de `examples/` com 01/2026 a 07/2026:
esperado "✓ Importação aceita: BRASIL REVERSO GERENCIAMENTO DE DESCARTA (07.213.542/0001-91), 378 contas,
15289 lançamentos". Importar de novo com mês inicial 02/2026: esperado "Importação recusada" com a
divergência `periodo`. O menu ☰ abre e mostra "Importar do IGC". Parar o servidor depois.

- [ ] **Step 7: Commit**

```bash
git add src/conta_tools_contabil/autorizacao.py src/conta_tools_contabil/api src/conta_tools_contabil/cli/serve.py docs/ACESSOS.md tests/conftest.py tests/helpers_app.py tests/test_api.py tests/test_http_auth_sweep.py tests/test_nav_menu.py
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "feat: API e tela de importação com RBAC do conta-tools-auth"
```

---

### Task 8: Fechamento da fase

**Files:**
- Modify: `pyproject.toml` (versão `0.1.0` → `0.1.1`), `CONTEXT.md`

- [ ] **Step 1: Suíte completa e lint**

Run: `python C:/dev/conta-tools-shared/scripts/testar.py`: Expected: tudo passa.
Run: `python -m ruff check src tests`: Expected: `All checks passed!`

- [ ] **Step 2: Conferir que nenhum dado de cliente entrou no git**

Run: `git -C /c/dev/conta-tools-contabil ls-files | grep -iE "examples/|dados\.js|dados-nfse\.js|prints/"`
Expected: saída vazia.

- [ ] **Step 3: Versão e CONTEXT.md**: subir PATCH para `0.1.1`; no `CONTEXT.md`, registrar os números conferidos com os arquivos reais (350 contas no razão, 378 no balancete, 15.289 lançamentos, 0 divergências) e a pendência: deploy (seção nova em `conta-tools-web/DEPLOY.md`, porta 5016, Caddy `/contabil/*`, `python-multipart` como dependência explícita) fica para quando o Eric decidir subir.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml CONTEXT.md
git diff --cached --stat
git commit -F "$TEMP/msg.txt"   # "chore: fecha a fase 1 (0.1.1)"
```
