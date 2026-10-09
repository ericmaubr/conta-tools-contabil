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
