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
    conf.write_text("[api]\nport = 5017\nroot_path = contabil/\n[db]\nurl = sqlite://\n", encoding="utf-8")
    c = carregar_api_conf(conf)
    assert (c.port, c.root_path, c.db_url, c.auth_jwt_segredo) == (5017, "/contabil", "sqlite://", "")


def test_segredo_vem_da_env_quando_vazio_no_conf(tmp_path, monkeypatch):
    monkeypatch.setenv("CONTA_TOOLS_AUTH_JWT_SECRET", "s3")
    conf = tmp_path / "api.conf"
    conf.write_text("[api]\nport = 5017\n", encoding="utf-8")
    assert carregar_api_conf(conf).auth_jwt_segredo == "s3"


def test_conf_ausente():
    with pytest.raises(FileNotFoundError):
        carregar_api_conf(Path("nao-existe.conf"))


def test_porta_padrao_e_5017(tmp_path):
    """5016 é do Consoli (DEPLOY.md, tabela de portas); o contabil fica na 5017."""
    conf = tmp_path / "api.conf"
    conf.write_text("[api]\nhost = 127.0.0.1\n", encoding="utf-8")
    assert carregar_api_conf(conf).port == 5017
