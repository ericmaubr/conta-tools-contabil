import re
from pathlib import Path

from conta_tools_contabil import autorizacao

_STATIC = Path(__file__).resolve().parents[1] / "src" / "conta_tools_contabil" / "api" / "static"


def test_modulo_de_item_de_menu_existe():
    """Módulo com typo some do menu para todo mundo, em silêncio."""
    modulos = set(re.findall(r"modulo: '([^']+)'", (_STATIC / "nav.js").read_text(encoding="utf-8")))
    assert modulos and modulos <= autorizacao._MODULOS_VALIDOS


def test_toda_pagina_carrega_nav_e_monta_o_menu():
    for pagina in _STATIC.glob("*.html"):
        fonte = pagina.read_text(encoding="utf-8")
        assert '<script src="nav.js"></script>' in fonte, pagina.name
        assert "montarNavLinks(" in fonte, pagina.name
