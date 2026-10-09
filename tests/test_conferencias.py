from datetime import date
from decimal import Decimal

from conta_tools_contabil.igc.balancete import Balancete, LinhaBalancete
from conta_tools_contabil.igc.plano import ContaPlano, Plano
from conta_tools_contabil.igc.razao import ContaRazao, LancamentoRazao, Razao
from conta_tools_contabil.importacao.conferencias import conferir, saldos_por_mes

D = Decimal


def _conta(conta, reduzido, nome, ant, lancs):
    """ContaRazao com o saldo impresso acumulado (D − C) em cada lançamento.
    lancs: [(mes, dia, débito, crédito, lote)]."""
    saldo, saida = D(ant), []
    for mes, dia, deb, cred, lote in lancs:
        saldo += D(deb) - D(cred)
        saida.append(LancamentoRazao(date(2026, mes, dia), "H", "-", lote, D(deb), D(cred), saldo))
    return ContaRazao(
        conta, reduzido, nome, D(ant), saida,
        sum((x.debito for x in saida), D("0")), sum((x.credito for x in saida), D("0")),
    )


def _cenario():
    """Balancete que fecha: CAIXA 100 D -> 130 D, FORNEC 30 C -> 0, CONTRA espelha os dois,
    IMOVEIS só no balancete, sem movimento. Débitos = créditos = 100; saldos somam zero."""
    razao = Razao("43", "ACME LTDA", date(2026, 1, 1), date(2026, 2, 28), [
        _conta("111", "1-9", "CAIXA", "100", [(1, 5, "50", "0", "1/1"), (2, 3, "0", "20", "1/2")]),
        _conta("211", "2-7", "FORNEC", "-30", [(1, 9, "30", "0", "1/3")]),
        _conta("411", "4-1", "CONTRA", "0",
               [(1, 5, "0", "50", "4/1"), (1, 9, "0", "30", "4/2"), (2, 3, "20", "0", "4/3")]),
    ])
    balancete = Balancete("07213542000191", "2026-01", "2026-02", [
        LinhaBalancete("1.1", "1-9", "CAIXA", D("100"), D("50"), D("20"), D("130")),
        LinhaBalancete("2.1", "2-7", "FORNEC", D("-30"), D("30"), D("0"), D("0")),
        LinhaBalancete("1.2", "3-5", "IMOVEIS", D("-70"), D("0"), D("0"), D("-70")),
        LinhaBalancete("4.1", "4-1", "CONTRA", D("0"), D("20"), D("80"), D("-60")),
    ], D("100"), D("100"))
    plano = Plano("ACME LTDA", [
        ContaPlano("1.1", "1-9", "CAIXA", "", 5), ContaPlano("2.1", "2-7", "FORNEC", "", 5),
        ContaPlano("1.2", "3-5", "IMOVEIS", "", 5), ContaPlano("4.1", "4-1", "CONTRA", "", 5),
    ])
    return razao, balancete, plano


def _conferir(razao, balancete, plano, anterior=None, ini="2026-01", fim="2026-02"):
    return conferir(
        razao, balancete, plano, mes_inicio=ini, mes_fim=fim, saldo_final_anterior=anterior or {}
    )


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
    balancete.total_credito = D("99")
    assert "balancete_fecha" in _codigos(_conferir(razao, balancete, plano))


def test_razao_divergente_do_balancete():
    razao, balancete, plano = _cenario()
    balancete.linhas[0] = LinhaBalancete("1.1", "1-9", "CAIXA", D("100"), D("51"), D("20"), D("131"))
    divs = _conferir(razao, balancete, plano)
    assert "razao_x_balancete" in _codigos(divs)
    assert any(d.reduzido == "1-9" for d in divs if d.conferencia == "razao_x_balancete")


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
    balancete.linhas[2] = LinhaBalancete("1.2", "3-5", "IMOVEIS", D("-70"), D("10"), D("0"), D("-60"))
    assert "conta_sem_razao" in _codigos(_conferir(razao, balancete, plano))


def test_lancamento_fora_do_periodo_e_repetido():
    razao, balancete, plano = _cenario()
    razao.contas[1].lancamentos.append(
        LancamentoRazao(date(2026, 3, 1), "H", "-", "1/3", D("0"), D("0"), D("0"))
    )
    codigos = set(_codigos(_conferir(razao, balancete, plano)))
    assert {"lancamento_fora_do_periodo", "lancamento_repetido"} <= codigos


def test_saldo_anterior_diferente_do_mes_anterior_gravado():
    divs = _conferir(*_cenario(), anterior={"1-9": D("99"), "2-7": D("-30")})
    assert _codigos(divs) == ["saldo_anterior"]
    assert divs[0].reduzido == "1-9"


def test_saldos_por_mes():
    razao, balancete, _ = _cenario()
    saldos = saldos_por_mes(razao, balancete, mes_inicio="2026-01", mes_fim="2026-02")
    s = {(x.reduzido, x.mes): x for x in saldos}
    assert (s["1-9", "2026-01"].saldo_anterior, s["1-9", "2026-01"].saldo_final) == (D("100"), D("150"))
    fev = s["1-9", "2026-02"]
    assert (fev.saldo_anterior, fev.credito, fev.saldo_final) == (D("150"), D("20"), D("130"))
    assert s["3-5", "2026-02"].saldo_final == D("-70")  # conta sem movimento entra com o saldo
    assert len(s) == 8  # 4 contas x 2 meses


def test_periodo_errado_nao_soterra_com_saldo_anterior():
    """Com o período divergente, comparar o saldo anterior com o mês anterior gravado não faz
    sentido: no caso real virou 133 divergências escondendo a de período."""
    divs = _conferir(*_cenario(), anterior={"1-9": D("99")}, ini="2026-02")
    assert _codigos(divs) == ["periodo"]
