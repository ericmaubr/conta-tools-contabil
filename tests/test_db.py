from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

from conta_tools_contabil import db
from conta_tools_contabil.conf import carregar_api_conf


def test_migracao_cria_o_mesmo_schema_do_metadata(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    db.set_database_url(url)  # explícita, como o migrar --conf faz
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


def test_migrar_com_conf_ignora_api_conf_da_pasta_atual(tmp_path, monkeypatch):
    """Achado no deploy (2026-10-09): rodando de C:\ContaTools\consoli, o `migrar --conf
    ...contabil\api.conf` conectou no banco do Consoli, porque o env.py preferia o api.conf da
    pasta atual ao --conf informado."""
    from conta_tools_contabil.cli.migrar import main_migrar

    monkeypatch.delenv("DATABASE_URL", raising=False)
    certo, errado = tmp_path / "certo.db", tmp_path / "outro" / "errado.db"
    errado.parent.mkdir()
    (errado.parent / "api.conf").write_text(f"[db]\nurl = sqlite:///{errado.as_posix()}\n", encoding="utf-8")
    meu_conf = tmp_path / "api.conf"
    meu_conf.write_text(f"[db]\nurl = sqlite:///{certo.as_posix()}\n", encoding="utf-8")
    monkeypatch.chdir(errado.parent)

    assert main_migrar(["--conf", str(meu_conf)]) == 0
    assert "lancamento" in inspect(create_engine(f"sqlite:///{certo.as_posix()}")).get_table_names()
    assert not errado.exists() or not inspect(create_engine(f"sqlite:///{errado.as_posix()}")).get_table_names()
