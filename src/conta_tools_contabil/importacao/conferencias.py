"""Conferências da importação: função pura, devolve as divergências encontradas.

Regra da spec (seção 4): qualquer divergência recusa a importação inteira. Por isso a função
devolve TODAS as divergências de uma vez, para o analista corrigir a exportação numa ida só.

Códigos estáveis (a tela mostra a mensagem): periodo, empresa, balancete_fecha,
conta_sem_balancete, conta_sem_razao, razao_x_balancete, total_da_conta, conta_fora_do_plano,
lancamento_fora_do_periodo, lancamento_repetido, saldo_anterior, saldo_posterior."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from decimal import Decimal

from conta_tools_contabil.igc.balancete import Balancete
from conta_tools_contabil.igc.plano import Plano
from conta_tools_contabil.igc.razao import Razao
from conta_tools_contabil.importacao.periodo import (
    mes_seguinte,
    meses_do_periodo,
    primeiro_dia,
    ultimo_dia,
)

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
    razao: Razao,
    balancete: Balancete,
    plano: Plano,
    *,
    mes_inicio: str,
    mes_fim: str,
    saldo_final_anterior: dict[str, Decimal],
    saldo_anterior_seguinte: dict[str, Decimal] | None = None,
) -> list[Divergencia]:
    """`saldo_final_anterior`: saldo final gravado do mês antes de `mes_inicio`.
    `saldo_anterior_seguinte`: saldo anterior gravado do mês depois de `mes_fim` (reimportação de
    um mês do meio). Vazio = não há mês gravado ali, não confere."""
    div: list[Divergencia] = []

    def add(codigo: str, reduzido: str | None, msg: str) -> None:
        div.append(Divergencia(codigo, reduzido, msg))

    # período: o informado pelo analista tem que ser o dos dois arquivos
    if (balancete.mes_inicio, balancete.mes_fim) != (mes_inicio, mes_fim):
        add("periodo", None,
            f"balancete é de {balancete.mes_inicio} a {balancete.mes_fim}; "
            f"informado {mes_inicio} a {mes_fim}")
    if (razao.inicio, razao.fim) != (primeiro_dia(mes_inicio), ultimo_dia(mes_fim)):
        add("periodo", None,
            f"razão é de {razao.inicio:%d/%m/%Y} a {razao.fim:%d/%m/%Y}; "
            f"informado {mes_inicio} a {mes_fim}")

    # empresa: o balancete não traz o nome; razão e plano trazem
    if razao.empresa_nome.strip().casefold() != plano.empresa_nome.strip().casefold():
        add("empresa", None,
            f"razão é de '{razao.empresa_nome}' e o plano de '{plano.empresa_nome}'")

    # balancete fecha: débitos = créditos = TOTAL GERAL, e os saldos somam zero
    def soma(campo: str) -> Decimal:
        return sum((getattr(x, campo) for x in balancete.linhas), ZERO)

    if not (
        soma("debito") == soma("credito") == balancete.total_debito == balancete.total_credito
        and soma("saldo_anterior") == ZERO
        and soma("saldo_atual") == ZERO
    ):
        add("balancete_fecha", None,
            f"balancete não fecha: débitos {_br(soma('debito'))}, créditos {_br(soma('credito'))}, "
            f"TOTAL GERAL {_br(balancete.total_debito)} / {_br(balancete.total_credito)}")

    plano_reduzidos = {c.reduzido for c in plano.contas if c.reduzido}
    bal = {x.reduzido: x for x in balancete.linhas}
    no_razao = {c.reduzido for c in razao.contas}
    # lançamento confere contra o período impresso no próprio razão: período informado errado já é
    # a divergência `periodo`; comparar com ele soterraria a mensagem com milhares de linhas
    ini, fim = razao.inicio, razao.fim

    for conta in razao.contas:
        r = conta.reduzido
        if r not in plano_reduzidos:
            add("conta_fora_do_plano", r,
                f"conta {r} {conta.nome} está no razão e não no plano de contas")
        deb = sum((lc.debito for lc in conta.lancamentos), ZERO)
        cred = sum((lc.credito for lc in conta.lancamentos), ZERO)
        totais = (conta.total_debito, conta.total_credito)
        if conta.total_debito is not None and (deb, cred) != totais:
            add("total_da_conta", r,
                f"conta {r}: soma dos lançamentos D {_br(deb)} C {_br(cred)} "
                f"difere do 'Total da Conta'")
        for lote, n in Counter(lc.lote_lcto for lc in conta.lancamentos).items():
            if n > 1:
                add("lancamento_repetido", r, f"conta {r}: Lote/Lcto {lote} aparece {n} vezes")
        for lc in conta.lancamentos:
            if not ini <= lc.data <= fim:
                add("lancamento_fora_do_periodo", r,
                    f"conta {r}: lançamento {lc.lote_lcto} em {lc.data:%d/%m/%Y}")
        b = bal.get(r)
        if b is None:
            add("conta_sem_balancete", r,
                f"conta {r} {conta.nome} está no razão e não no balancete")
            continue
        # o razão imprime o saldo com o sinal da natureza; o balancete traz o lado D/C:
        # compara em valor absoluto
        ultimo = (
            conta.lancamentos[-1].saldo_impresso if conta.lancamentos
            else conta.saldo_anterior_impresso
        )
        if (
            (deb, cred) != (b.debito, b.credito)
            or b.saldo_anterior + deb - cred != b.saldo_atual
            or abs(conta.saldo_anterior_impresso) != abs(b.saldo_anterior)
            or abs(ultimo) != abs(b.saldo_atual)
        ):
            add("razao_x_balancete", r,
                f"conta {r}: razão (ant {_br(conta.saldo_anterior_impresso)}, D {_br(deb)}, "
                f"C {_br(cred)}) x balancete (ant {_br(b.saldo_anterior)}, D {_br(b.debito)}, "
                f"C {_br(b.credito)}, atual {_br(b.saldo_atual)})")

    for b in balancete.linhas:
        if b.reduzido not in no_razao and (b.debito or b.credito):
            add("conta_sem_razao", b.reduzido,
                f"conta {b.reduzido} {b.descricao} tem movimento no balancete e não está no razão")
        if b.reduzido not in plano_reduzidos and b.reduzido not in no_razao:
            add("conta_fora_do_plano", b.reduzido,
                f"conta {b.reduzido} {b.descricao} está no balancete e não no plano de contas")

    # continuidade com o mês anterior já gravado. Com o período divergente ela não faz sentido (o
    # arquivo não começa no mês informado) e, no caso real, virou 133 linhas escondendo a `periodo`
    periodo_ok = not any(d.conferencia == "periodo" for d in div)
    # As duas pontas olham a UNIÃO das contas: conta nova com saldo anterior ≠ 0 também denuncia
    # mês anterior gravado velho (revisão final, achado 4). Conta que falta de um lado vale 0.
    if periodo_ok and saldo_final_anterior:
        for reduzido in sorted(saldo_final_anterior.keys() | bal.keys()):
            atual = bal[reduzido].saldo_anterior if reduzido in bal else ZERO
            gravado = saldo_final_anterior.get(reduzido, ZERO)
            if atual != gravado:
                add("saldo_anterior", reduzido,
                    f"conta {reduzido}: saldo anterior {_br(atual)} difere do saldo final "
                    f"gravado do mês anterior {_br(gravado)}")

    # Reimportar um mês do meio que muda o saldo final deixaria o mês seguinte já gravado
    # começando de outro saldo (revisão final, achado 2): recusa e pede o período até o fim.
    seguinte = saldo_anterior_seguinte or {}
    if periodo_ok and seguinte:
        prox = mes_seguinte(mes_fim)
        for reduzido in sorted(seguinte.keys() | bal.keys()):
            final = bal[reduzido].saldo_atual if reduzido in bal else ZERO
            gravado = seguinte.get(reduzido, ZERO)
            if final != gravado:
                add("saldo_posterior", reduzido,
                    f"conta {reduzido}: saldo final {_br(final)} difere do saldo anterior "
                    f"{_br(gravado)} de {prox}, que já está gravado; importe de {mes_inicio} "
                    f"até o último mês gravado")
    return div


def saldos_por_mes(
    razao: Razao, balancete: Balancete, *, mes_inicio: str, mes_fim: str
) -> list[SaldoMes]:
    """Saldo de cada conta do balancete em cada mês.

    Só chamar depois de `conferir` sem divergência."""
    lancs = {c.reduzido: c.lancamentos for c in razao.contas}
    saida = []
    for b in balancete.linhas:
        saldo = b.saldo_anterior
        for mes in meses_do_periodo(mes_inicio, mes_fim):
            doms = [lc for lc in lancs.get(b.reduzido, []) if f"{lc.data:%Y-%m}" == mes]
            deb = sum((lc.debito for lc in doms), ZERO)
            cred = sum((lc.credito for lc in doms), ZERO)
            saida.append(SaldoMes(b.reduzido, mes, saldo, deb, cred, saldo + deb - cred))
            saldo = saldo + deb - cred
    return saida
