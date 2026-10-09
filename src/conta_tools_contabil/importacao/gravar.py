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
from conta_tools_contabil.importacao.periodo import (
    mes_anterior,
    mes_seguinte,
    meses_do_periodo,
    validar_mes,
)


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
    engine: Engine,
    *,
    razao: bytes,
    balancete: bytes,
    plano: bytes,
    mes_inicio: str,
    mes_fim: str,
    quem: str,
) -> ResultadoImportacao:
    validar_mes(mes_inicio)
    validar_mes(mes_fim)
    meses = meses_do_periodo(mes_inicio, mes_fim)
    r = _ler("razão", ler_razao, razao)
    b = _ler("balancete", ler_balancete, balancete)
    p = _ler("plano de contas", ler_plano, plano)

    with engine.begin() as conn:
        t = db.conta_mes

        def saldos_gravados(coluna, mes):
            return {
                x.reduzido: Decimal(x.valor)  # conversao-ok: coluna Numeric do banco
                for x in conn.execute(select(t.c.reduzido, coluna.label("valor")).where(
                    t.c.cnpj == b.cnpj, t.c.mes == mes))
            }

        divergencias = conferir(
            r, b, p, mes_inicio=mes_inicio, mes_fim=mes_fim,
            saldo_final_anterior=saldos_gravados(t.c.saldo_final, mes_anterior(mes_inicio)),
            saldo_anterior_seguinte=saldos_gravados(t.c.saldo_anterior, mes_seguinte(mes_fim)),
        )
        aceita = not divergencias
        imp_id = str(uuid.uuid4())
        n_lanc = sum(len(c.lancamentos) for c in r.contas)
        conn.execute(db.importacao.insert().values(
            id=imp_id, cnpj=b.cnpj, codigo_igc=r.codigo_igc, empresa_nome=r.empresa_nome,
            mes_inicio=mes_inicio, mes_fim=mes_fim, status="aceita" if aceita else "recusada",
            divergencias=json.dumps([asdict(d) for d in divergencias], ensure_ascii=False),
            contas=len(b.linhas), lancamentos=n_lanc,
            hash_razao=hashlib.sha256(razao).hexdigest(),
            hash_balancete=hashlib.sha256(balancete).hexdigest(),
            hash_plano=hashlib.sha256(plano).hexdigest(),
            quem=quem, criado_em=datetime.now().isoformat(timespec="seconds"),
        ))
        if aceita:
            _gravar_dados(conn, imp_id, b.cnpj, r, b, p, meses, mes_inicio, mes_fim)

    return ResultadoImportacao(
        imp_id, aceita, divergencias, b.cnpj, r.empresa_nome, len(b.linhas), n_lanc
    )


def _gravar_dados(conn, imp_id, cnpj, r, b, p, meses, mes_inicio, mes_fim) -> None:
    conn.execute(db.plano_conta.insert(), [
        {"importacao_id": imp_id, "classificacao": c.classificacao, "reduzido": c.reduzido,
         "descricao": c.descricao, "cnpj": c.cnpj, "grau": c.grau}
        for c in p.contas
    ])

    bal = {x.reduzido: x for x in b.linhas}
    cm = db.conta_mes
    conn.execute(delete(cm).where(cm.c.cnpj == cnpj, cm.c.mes.in_(meses)))
    conn.execute(cm.insert(), [
        {"cnpj": cnpj, "reduzido": s.reduzido, "mes": s.mes,
         "classificacao": bal[s.reduzido].classificacao, "descricao": bal[s.reduzido].descricao,
         "saldo_anterior": s.saldo_anterior, "debito": s.debito, "credito": s.credito,
         "saldo_final": s.saldo_final, "importacao_id": imp_id}
        for s in saldos_por_mes(r, b, mes_inicio=mes_inicio, mes_fim=mes_fim)
    ])

    # lançamentos: sincroniza por identidade (cnpj, reduzido, lote_lcto) nos meses do período
    novos = {
        (cnpj, c.reduzido, lc.lote_lcto): {
            "cnpj": cnpj, "reduzido": c.reduzido, "lote_lcto": lc.lote_lcto,
            "mes": f"{lc.data:%Y-%m}", "data": lc.data.isoformat(), "historico": lc.historico,
            "contrapartida": lc.contrapartida, "valor": lc.debito - lc.credito,
            "importacao_id": imp_id,
        }
        for c in r.contas for lc in c.lancamentos
    }
    t = db.lancamento
    chave_t = tuple_(t.c.cnpj, t.c.reduzido, t.c.lote_lcto)
    # Identidade buscada em TODOS os meses da empresa: Lote/Lcto é ID global do IGC e não muda
    # quando a data do lançamento é corrigida (revisão final, achado 1: virava IntegrityError).
    # ponytail: lê as chaves de todos os meses da empresa; se crescer demais, filtrar pelas chaves.
    mes_de = {
        (x.cnpj, x.reduzido, x.lote_lcto): x.mes
        for x in conn.execute(
            select(t.c.cnpj, t.c.reduzido, t.c.lote_lcto, t.c.mes).where(t.c.cnpj == cnpj)
        )
    }
    existentes = set(mes_de)
    # ponytail: apaga num IN só; o SQLite aceita 32.766 parâmetros e a importação real tem
    # 15.289 lançamentos. Se passar disso, apagar em lotes de 5.000.
    sumiram = {k for k in existentes - novos.keys() if mes_de[k] in meses}
    if sumiram:
        conn.execute(delete(t).where(chave_t.in_(list(sumiram))))
    identidade = ("cnpj", "reduzido", "lote_lcto")
    for chave in existentes & novos.keys():
        valores = {k: v for k, v in novos[chave].items() if k not in identidade}
        conn.execute(t.update().where(
            t.c.cnpj == chave[0], t.c.reduzido == chave[1], t.c.lote_lcto == chave[2]
        ).values(**valores))
    a_inserir = [novos[k] for k in novos.keys() - existentes]
    if a_inserir:
        conn.execute(t.insert(), a_inserir)
