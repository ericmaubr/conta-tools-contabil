import pytest

from conta_tools_contabil import autorizacao


@pytest.fixture(autouse=True)
def _resetar_autorizacao():
    """`autorizacao` guarda o segredo em global de módulo: sem reset, um teste com auth ligada
    vazaria para os seguintes."""
    autorizacao.configurar(jwt_segredo="")
