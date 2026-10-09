import subprocess
import sys


def _rodar(*args):
    return subprocess.run(
        [sys.executable, "-m", "conta_tools_contabil", *args],
        capture_output=True, text=True, timeout=60,
        # sem isto o Windows levanta WinError 6 quando quem roda o pytest não tem stdin
        stdin=subprocess.DEVNULL,
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
