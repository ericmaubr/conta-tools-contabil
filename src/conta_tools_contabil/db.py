"""Engine e schema (SQLAlchemy Core). `metadata` é a fonte da verdade; as migrações em
alembic/versions/ seguem ela."""

from __future__ import annotations

from conta_tools_shared.db_bootstrap import criar_engine, resolver_database_url
from sqlalchemy import (
    CheckConstraint,
    Column,
    Engine,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
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
    Column("valor", Numeric(15, 2), nullable=False),  # D − C
    Column("importacao_id", String, ForeignKey("importacao.id"), nullable=False),
)
Index("ix_lancamento_cnpj_mes", lancamento.c.cnpj, lancamento.c.mes)

_database_url_override: str | None = None
_engine: Engine | None = None


def set_database_url(url: str) -> None:
    global _database_url_override, _engine
    _database_url_override = url
    _engine = None


def url_explicita() -> str | None:
    """URL definida por `set_database_url` (CLI com --conf/--db-url), ou None."""
    return _database_url_override


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
