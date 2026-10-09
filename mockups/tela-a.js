// Tela A e variações. window.MODO: 'base' | 'cp' (descrição da contrapartida) | 'cp-nivel' (subnível por contrapartida)
const MODO = window.MODO || 'base';
const ROTULOS = !!window.TELA_V1;   // V1: botões com texto, aceitar todas, teclado, quem fez
let atual = null, abertosUI = new Set(), marcados = new Set();

const cpDesc = cp => { const p = D.plano[cp]; return p ? p[1] : cp === '-' ? 'sem contrapartida' : ''; };
const cpCelula = cp => MODO === 'cp' && cp ? `<b>${esc(cp)}</b> <span class="muted">${esc(cpDesc(cp))}</span>` : esc(cp);
const deb = ls => soma(ls.filter(l => l.v > 0));
const cred = ls => -soma(ls.filter(l => l.v < 0));
const dif = v => `<td class="n dif ${v < -0.004 ? 'neg' : ''}">${fmt(v)}</td>`;
const tot = ls => `<td class="n tot">${fmt(deb(ls))}</td><td class="n tot">${fmt(cred(ls))}</td>${dif(soma(ls))}`;

function listar() {
  const g = $('f-grupo').value, b = $('f-busca').value.trim().toUpperCase(), so = $('f-pend').checked;
  let cs = contasDoGrupo(g).map(c => ({ c, r: resumo(c) }));
  const total = cs.length;
  if (b) cs = cs.filter(x => x.c.nome.toUpperCase().includes(b) || x.c.red.includes(b) || x.c.conta.includes(b));
  // pendência = em aberto + sugestões + o que falta lançar no IGC (NFS-e e ajustes, quando a tela tiver)
  // conta fechada (V1) não tem pendência: o que ficou em aberto é o saldo atestado pelo analista
  const pend = x => fechada(x.c) ? 0 : x.r.abertos + x.r.sugestoes + (window.PEND_EXTRA ? window.PEND_EXTRA(x.c) : 0);
  if (so) cs = cs.filter(pend);
  cs.sort((a, b) => pend(b) - pend(a) || a.c.nome.localeCompare(b.c.nome));
  $('contagem').textContent = `${cs.length} de ${total} contas`;
  $('lista').innerHTML = cs.map(({ c, r }) => `
    <div class="item ${atual === c ? 'atual' : ''}" data-i="${c.i}">
      <div class="nome">${esc(c.nome)}</div>
      <div class="sub"><span>${c.cls} · ${c.red}</span><span class="n ${r.saldo < 0 ? 'neg' : ''}">${fmt(r.saldo)}</span></div>
      <div class="sub" style="justify-content:flex-start">
        ${fechada(c) ? `<span class="tag fechada">✓ fechada${r.abertos ? ' · saldo de ' + r.abertos + ' itens' : ''}</span>` : `
        ${r.abertos ? `<span class="tag aberto">${r.abertos} em aberto</span>` : ''}
        ${r.sugestoes ? `<span class="tag sugestao">${r.sugestoes} p/ revisar</span>` : ''}
        ${!r.abertos && !r.sugestoes ? '<span class="tag zerada">✓ conciliada</span>' : ''}`}
        ${c.so_balancete ? '<span class="tag ant">sem movimento</span>' : ''}
      </div>
    </div>`).join('') || '<div class="contagem">Nenhuma conta. Desmarque "só contas com pendência".</div>';
  $('lista').querySelectorAll('.item').forEach(el => el.onclick = () => abrir(D.contas[el.dataset.i]));
  if (!atual && cs.length) abrir(window.ABRIR_PRIMEIRA ? cs[0].c : cs.find(x => x.c.nome.startsWith('VIANA'))?.c || cs[0].c);
}
// próxima/anterior conta da lista (teclado)
function irConta(passo) {
  const its = [...$('lista').querySelectorAll('.item[data-i]')], k = its.findIndex(el => +el.dataset.i === atual.i);
  const alvo = its[k + passo]; if (alvo) { abrir(D.contas[alvo.dataset.i]); alvo.scrollIntoView({ block: 'nearest' }); }
}

function abrir(c) { atual = c; abertosUI = new Set(); marcados = new Set(); listar(); render(); }

// ---- candidatos (V1): com lançamentos marcados e diferença, quais em aberto da conta a zeram.
// Primeiro um lançamento sozinho; se não houver, pares. A tela não escolhe: mostra todos, pela data mais próxima dos marcados.
let CAND = new Map(), candLista = [], candPar = false, candPos = -1;   // CAND: id -> rótulo da etiqueta
const ordData = d => +(d.slice(6) + d.slice(3, 5) + d.slice(0, 2));    // dd/mm/aa -> aammdd
function calcCandidatos() {
  CAND = new Map(); candLista = []; candPar = false; candPos = -1;
  if (!ROTULOS || !marcados.size) return;
  const ls = atual.lanc.filter(l => marcados.has(l.id)), s = soma(ls);
  if (Math.abs(s) <= TOLERANCIA) return;
  const alvo = -s, ref = Math.max(...ls.map(l => ordData(l.data)));
  const dist = l => Math.abs(ordData(l.data) - ref);   // ponytail: distância em aammdd, aproximada; basta para ordenar
  const livres = abertos(atual).filter(l => !marcados.has(l.id));
  const um = livres.filter(l => Math.abs(l.v - alvo) <= TOLERANCIA).sort((a, b) => dist(a) - dist(b));
  if (um.length) { um.forEach(l => CAND.set(l.id, 'fecha a diferença')); candLista = um.map(l => [l]); return; }
  const pares = [];
  // ponytail: O(n²) nos itens em aberto da conta; instantâneo até uns 2 mil
  for (let i = 0; i < livres.length; i++) for (let j = i + 1; j < livres.length; j++)
    if (Math.abs(livres[i].v + livres[j].v - alvo) <= TOLERANCIA) pares.push([livres[i], livres[j]]);
  pares.sort((p, q) => Math.min(dist(p[0]), dist(p[1])) - Math.min(dist(q[0]), dist(q[1])));
  candLista = pares.slice(0, 20); candPar = candLista.length > 0;
  candLista.forEach(p => p.forEach(l => CAND.set(l.id, 'fecha em par')));
}
// próximo candidato (botão da barra ou tecla C); num par, as duas linhas ficam contornadas juntas
function irCandidato() {
  if (!candLista.length) return;
  candPos = (candPos + 1) % candLista.length;
  const atuais = candLista[candPos], tr = $('tab').querySelector(`tr[data-lin="${atuais[0].id}"]`);
  if (!tr) return;
  $('tab').querySelectorAll('tr.par-atual').forEach(x => x.classList.remove('par-atual'));
  if (candPar) atuais.forEach(l => { const t = $('tab').querySelector(`tr[data-lin="${l.id}"]`); if (t) t.classList.add('par-atual'); });
  cursor = 'l' + atuais[0].id; marcarCursor(); rolarAte(tr, 'center');
  if (candPar) alerta(`Par ${candPos + 1} de ${candLista.length}: ${atuais.map(l => l.data + ' ' + fmt(Math.abs(l.v))).join(' + ')}`, 'info');
}

function linha(l, extra, recuo) {
  const chk = l.g == null ? `<input type="checkbox" ${marcados.has(l.id) ? 'checked' : ''}>` : '';
  const grupoTag = MODO === 'cp-nivel' && l.g != null ? (() => { const x = grupos(atual).find(y => y.g === l.g); return `<span class="tag ${x.st}" title="${esc(MOTIVO[x.m])}">${esc(x.nome)}</span> `; })() : '';
  const cand = l.g == null && CAND.get(l.id);
  return `<tr class="${l.g == null ? 'aberto clicavel' : ''} ${marcados.has(l.id) ? 'marcado' : ''} ${cand ? 'candidato' : ''}" ${l.g == null ? `data-lin="${l.id}"` : ''}>
    <td style="width:28px">${chk}</td><td style="padding-left:${8 + (recuo || 0)}px">${l.data}</td>
    <td class="hist">${cand ? `<span class="tag cand">${esc(cand)}</span> ` : ''}${grupoTag}${l.ant ? '<span class="tag ant">período anterior</span> ' : ''}${esc(l.hist)}</td>
    <td>${cpCelula(l.cp)}</td>
    <td class="n">${l.v > 0 ? fmt(l.v) : ''}</td><td class="n">${l.v < 0 ? fmt(-l.v) : ''}</td>${dif(l.v)}${extra || '<td></td>'}</tr>`;
}

// subnível por contrapartida (modo cp-nivel): chave da UI = 'secao|cp'
function blocoCP(secao, ls) {
  const porCP = new Map();
  ls.forEach(l => { if (!porCP.has(l.cp)) porCP.set(l.cp, []); porCP.get(l.cp).push(l); });
  return [...porCP.entries()].sort((a, b) => Math.abs(soma(b[1])) - Math.abs(soma(a[1]))).map(([cp, xs]) => {
    const k = secao + '|' + cp, a = abertosUI.has(k);
    return `<tr class="sub" data-k="${esc(k)}"><td colspan="4" style="padding-left:16px"><span class="seta ${a ? 'aberta' : ''}">▸</span>
      <b>${esc(cp || '(vazio)')}</b> ${esc(cpDesc(cp))} <span class="muted" style="font-weight:400">${xs.length} lanç.</span></td>${tot(xs)}<td></td></tr>`
      + (a ? xs.map(l => linha(l, null, 0)).join('') : '');
  }).join('');
}

function seloBalancete(c, r) {
  const b = c.bal;
  if (!b) return '<span class="tag sugestao">conta sem linha no balancete</span>';
  const mov = c.lanc.filter(l => !l.ant);
  const itens = [['saldo anterior', c.saldo_ant, b.ant], ['débitos', deb(mov), b.d], ['créditos', cred(mov), b.c], ['saldo final', r.saldo, b.atu]];
  const ruins = itens.filter(([, a, x]) => Math.abs(a - x) > 0.005);
  const mv = c.so_balancete ? ' <span class="tag ant">sem movimento no período: saldo só no balancete</span>' : '';
  if (!ruins.length) return `<span class="tag zerada" title="Saldo anterior ${fmt(b.ant)} · D ${fmt(b.d)} · C ${fmt(b.c)} · saldo atual ${fmt(b.atu)}">✓ conferido com o balancete: saldo anterior, débitos, créditos e saldo final</span>` + mv;
  return '<span class="tag aberto">≠ balancete: ' + ruins.map(([n, a, x]) => `${n} ${fmt(a)} × ${fmt(x)}`).join(' · ') + '</span>' + mv;
}

function render() {
  calcCandidatos();
  const c = atual, r = resumo(c), gs = grupos(c), ab = abertos(c);
  const confere = Math.abs(r.somaAbertos - r.saldo) < 0.005;
  $('cab').innerHTML = `
    <div><b style="font-size:15px">${esc(c.nome)}</b> <span class="muted">${c.cls} · reduzida ${c.red} · ${c.conta}${c.cnpj ? ' · CNPJ ' + esc(c.cnpj) : ''}</span></div>
    <div class="resumo" style="margin-top:10px">
      <div><small>Saldo anterior</small><b>${fmt(c.saldo_ant)}</b></div>
      <div><small>Débitos</small><b>${fmt(deb(c.lanc.filter(l => !l.ant)))}</b></div>
      <div><small>Créditos</small><b>${fmt(cred(c.lanc.filter(l => !l.ant)))}</b></div>
      <div><small>Saldo final (D−C)</small><b class="${r.saldo < 0 ? 'neg' : ''}">${fmt(r.saldo)}</b></div>
      <div><small>Soma dos itens em aberto</small><b>${fmt(r.somaAbertos)}</b></div>
      <div>${confere ? '<span class="ok">✓ o saldo é explicado pelos itens em aberto</span>'
        : `<span class="tag sugestao">diferença de ${fmt(r.saldo - r.somaAbertos)}: ${window.AJ_HOOK ? 'centavos com ajuste a lançar no IGC' : 'centavos aceitos nos grupos'}</span>`}</div>
    </div>
    <div style="margin-top:8px">${seloBalancete(c, r)}</div>${ROTULOS ? blocoFechamento(c, r) : ''}`;
  if (ROTULOS) ligarFechamento(c);
  const sug = gs.filter(x => x.st === 'sugestao'), ok = gs.filter(x => x.st !== 'sugestao');
  const todas = ls => ls.flatMap(x => x.ls);
  let h = `<tr><th></th><th>Data</th><th>Histórico</th><th>${MODO === 'base' ? 'CP' : 'Contrapartida'}</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n">D − C</th><th></th></tr>`;
  const secao = (txt, ls, n, acao) => `<tr class="secao"><td colspan="4">${txt} (${n})</td>${tot(ls)}<td style="text-align:right">${acao || ''}</td></tr>`;
  const quemFez = x => { if (!ROTULOS) return ''; const r = ultimoRegistro(c, x.g); return r ? ` <span class="muted" style="font-weight:400;font-size:11px">· ${esc(r.quem)}, ${quando(r.t)}</span>` : ''; };
  const blocoGrupo = (x, acoes) => {
    const a = abertosUI.has(x.g);
    return `<tr class="grp" data-g="${x.g}"><td><span class="seta ${a ? 'aberta' : ''}">▸</span></td>
      <td colspan="3">${esc(x.nome)} <span class="tag ${x.st}">${MOTIVO[x.m]}</span> <span class="muted" style="font-weight:400">${x.ls.length} lanç.</span>
      ${Math.abs(x.soma) < 0.005 ? '<span class="ok">✓</span>' : '<span class="neg">dif. ' + fmt(x.soma) + '</span>'}${x.st !== 'sugestao' ? quemFez(x) : ''}</td>
      ${tot(x.ls)}<td style="text-align:right;white-space:nowrap">${acoes}</td></tr>` + (a ? x.ls.map(l => linha(l, '<td></td>', 14)).join('') : '');
  };
  // ROTULOS (tela V1): botões com texto e a ação de recusar afastada da de aceitar
  const acoesSug = x => ROTULOS
    ? `<button class="btn-txt excluir" data-desfazer="${x.g}" title="Os lançamentos voltam para Em aberto">Recusar</button><span class="sep"></span><button class="btn-txt ok" data-aceitar="${x.g}" data-primario title="O grupo passa a conciliado (Enter)">✓ Aceitar</button>`
    : `<button class="btn-icone" data-aceitar="${x.g}" title="Aceitar: o grupo passa a conciliado">✓</button> <button class="btn-icone excluir" data-desfazer="${x.g}" title="Recusar: os lançamentos voltam para Em aberto">✕</button>`;
  const acoesOk = x => ROTULOS
    ? `<button class="btn-txt" data-desfazer="${x.g}" title="Os lançamentos voltam para Em aberto">↶ Desfazer</button>`
    : `<button class="btn-icone excluir" data-desfazer="${x.g}" title="Desfazer: os lançamentos voltam para Em aberto">↶</button>`;

  h += secao(fechada(c) ? '✓ Saldo em ' + dataFimBR() + ': composição atestada' : '⚠ Em aberto', ab, ab.length);
  if (!ab.length) h += '<tr><td colspan="8" class="muted" style="padding:12px">Nada em aberto. ✓</td></tr>';
  else h += MODO === 'cp-nivel' ? blocoCP('aberto', ab) : ab.map(l => linha(l)).join('');
  if (sug.length) {
    h += secao('🔎 Sugestões para revisar', todas(sug), sug.length, ROTULOS ? `<button class="btn-txt ok" id="aceitar-todas" title="Aceita todas as sugestões desta conta numa ação só (desfaz com Ctrl+Z)">✓ Aceitar todas (${sug.length})</button>` : '');
    h += MODO === 'cp-nivel' ? blocoCP('sug', todas(sug)) : sug.map(x => blocoGrupo(x, acoesSug(x))).join('');
  }
  h += secao('✓ Conciliados', todas(ok), ok.length);
  h += MODO === 'cp-nivel' ? blocoCP('ok', todas(ok)) : ok.map(x => blocoGrupo(x, acoesOk(x))).join('');
  h += `<tr class="total"><td colspan="4">Total da conta (com saldo anterior)</td>${tot(c.lanc)}<td></td></tr>`;
  $('tab').innerHTML = h;

  $('tab').querySelectorAll('tr.grp').forEach(tr => tr.onclick = e => {
    if (e.target.closest('button')) return;
    const g = +tr.dataset.g; abertosUI.has(g) ? abertosUI.delete(g) : abertosUI.add(g); render();
  });
  $('tab').querySelectorAll('tr.sub').forEach(tr => tr.onclick = () => {
    const k = tr.dataset.k; abertosUI.has(k) ? abertosUI.delete(k) : abertosUI.add(k); render();
  });
  $('tab').querySelectorAll('tr[data-lin]').forEach(tr => tr.onclick = () => {
    const id = +tr.dataset.lin; marcados.has(id) ? marcados.delete(id) : marcados.add(id); render();
  });
  $('tab').querySelectorAll('[data-aceitar]').forEach(b => b.onclick = () => { aceitar(c, +b.dataset.aceitar); alerta('Sugestão aceita.', '', true); listar(); render(); });
  $('tab').querySelectorAll('[data-desfazer]').forEach(b => b.onclick = () => { desfazer(c, +b.dataset.desfazer); alerta('Lançamentos voltaram para Em aberto.', 'info', true); listar(); render(); });
  if ($('aceitar-todas')) $('aceitar-todas').onclick = e => { e.stopPropagation(); aceitarTodas(c); };
  barra();
  marcarCursor();
}

// ---- fechar conta (V1): o analista atesta que o que ficou em aberto é o saldo correto no fim do período.
// Os itens continuam em aberto (no mês seguinte viram saldo anterior); muda o estado da conta.
// O fechamento guarda uma assinatura da conta: se ela mudar depois (ação, reimportação), a conta reabre sozinha.
const CHAVE_FECH = 'mock-fechadas-v1';
let FECH = {};
try { FECH = JSON.parse(localStorage.getItem(CHAVE_FECH) || '{}'); } catch (e) {}
const gravarFech = () => { try { localStorage.setItem(CHAVE_FECH, JSON.stringify(FECH)); } catch (e) {} };
if (ROTULOS) EXTRAS.push({ get: () => JSON.stringify(FECH), set: s => { FECH = JSON.parse(s); gravarFech(); } });
const assinatura = c => c.lanc.map(l => l.id + ':' + (l.g == null ? '' : l.g + l.m)).join(',') + '|' + (window.PEND_EXTRA ? window.PEND_EXTRA(c) : 0);
const fechada = c => ROTULOS && !!FECH[c.red] && FECH[c.red].sig === assinatura(c);
const dataFimBR = () => { const d = window.PERIODO_FIM || ''; return d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4); };
// só fecha conta sem sugestão para revisar e sem nada a lançar no IGC: os itens em aberto restantes são o saldo
const falta = c => { const r = resumo(c), x = window.PEND_EXTRA ? window.PEND_EXTRA(c) : 0; return [r.sugestoes && r.sugestoes + (r.sugestoes === 1 ? ' sugestão' : ' sugestões') + ' para revisar', x && x + ' a lançar no IGC'].filter(Boolean); };
function blocoFechamento(c, r) {
  const f = FECH[c.red];
  if (fechada(c)) return `<div class="fech-ok">✓ Conta fechada em ${dataFimBR()} · ${esc(f.quem)}, ${quando(f.t)}${f.obs ? ' · ' + esc(f.obs) : ''}
    <button class="btn-txt" id="fech-reabrir" title="Volta a conta para o estado aberto">Reabrir</button></div>`;
  const aviso = f ? `<span class="tag aberto">reaberta: a conta mudou depois do fechamento de ${quando(f.t)}</span> ` : '';
  const fl = falta(c);
  return `<div class="fech-linha">${aviso}${fl.length ? `<span>Para fechar a conta: ${fl.join(' e ')}.</span>`
    : `<button class="btn-txt ok" id="fech-abrir" title="Atestar que os itens em aberto são o saldo correto em ${dataFimBR()}">✓ Fechar conta</button> <span>${r.abertos ? r.abertos + ' itens em aberto ficam como saldo da conta.' : 'Nada em aberto.'}</span>`}</div>`;
}
function ligarFechamento(c) {
  if ($('fech-reabrir')) $('fech-reabrir').onclick = () => { snap(c, 'reabrir conta', null); delete FECH[c.red]; gravarFech(); alerta('Conta reaberta.', 'info', true); listar(); render(); };
  if ($('fech-abrir')) $('fech-abrir').onclick = () => confirmarFechamento(c);
}
function confirmarFechamento(c) {
  const r = resumo(c), ab = abertos(c), meses = [...new Set(ab.filter(l => !l.ant).map(l => l.data.slice(3)))];
  let m = $('fech-modal');
  if (!m) { document.body.insertAdjacentHTML('beforeend', '<div class="modal-fundo" id="fech-modal"><div class="modal" id="fech-corpo"></div></div>'); m = $('fech-modal'); }
  $('fech-corpo').innerHTML = `<h3>Fechar a conta ${esc(c.nome)}</h3>
    <div class="sub">Você atesta que os itens em aberto são o saldo correto da conta em ${dataFimBR()}. Eles continuam em aberto e entram no mês seguinte como saldo anterior.</div>
    <div class="lanc"><div><span>Itens em aberto</span><b>${ab.length}</b></div><div><span>Saldo (D − C)</span><b>${fmt(r.saldo)}</b></div>
      <div><span>Balancete</span><b>${seloBalancete(c, r).includes('≠') ? '≠ não confere' : '✓ confere'}</b></div>
      ${meses.length === 1 ? `<div><span>Datas</span><b>todos os itens em aberto são de ${meses[0].replace('/', '/20')}</b></div>` : ''}</div>
    <label>Observação (opcional)</label><input type="text" id="fech-obs" maxlength="120" placeholder="ex.: nota de julho, paga em agosto">
    <div class="rodape"><button class="secundario" id="fech-cancelar">Cancelar</button><button class="verde" id="fech-ok">✓ Fechar conta</button></div>`;
  m.classList.add('aberto'); $('fech-obs').focus();
  const fechar = () => { m.classList.remove('aberto'); document.activeElement.blur(); };   // sem foco preso no campo escondido
  $('fech-cancelar').onclick = fechar;
  $('fech-obs').onkeydown = e => { if (e.key === 'Enter') $('fech-ok').click(); if (e.key === 'Escape') fechar(); };
  $('fech-ok').onclick = () => {
    snap(c, 'fechar conta', null);
    FECH[c.red] = { quem: QUEM, t: new Date().toISOString(), obs: $('fech-obs').value.trim(), sig: assinatura(c) };
    gravarFech(); fechar(); alerta('Conta fechada.', '', true); listar(); render();
  };
}

// aceita todas as sugestões da conta numa ação só. Grupo com diferença de centavos só fecha junto com o ajuste (ajuste.js);
// sem conta de ajuste padrão da empresa, ele fica para o analista.
function aceitarTodas(c) {
  const sug = grupos(c).filter(x => x.st === 'sugestao');
  snap(c, 'aceitar todas (' + sug.length + ')', null);
  let fic = 0;
  sug.forEach(x => {
    if (x.m === 'centavos') { if (!(window.AJ_HOOK && window.AJ_HOOK.rapido(c, x, { semSnap: true, semAbrir: true }))) fic++; }
    else x.ls.forEach(l => { l.m = 'aceito'; });
  });
  c.mexida = true; salvar();
  alerta((sug.length - fic) + ' sugestões aceitas.' + (fic ? ' ' + fic + ' com diferença de centavos ficaram: defina a conta de ajuste da empresa no primeiro ajuste.' : ''), '', true);
  listar(); render(); EXTRAS.forEach(h => h.refresh && h.refresh());
}

// ---- teclado (tela V1): ↑↓ mover · Espaço marcar/abrir · Enter aceitar ou agrupar · X recusar · ] [ conta seguinte/anterior
let cursor = null, cursorIdx = 0;
const linhasNav = () => [...$('tab').querySelectorAll('tr[data-lin], tr.grp')].filter(tr => tr.offsetParent !== null);
const chaveTr = tr => tr.dataset.lin != null ? 'l' + tr.dataset.lin : 'g' + tr.dataset.g;
function marcarCursor() {
  if (!ROTULOS) return;
  const ls = linhasNav(); if (!ls.length) return;
  let tr = ls.find(x => chaveTr(x) === cursor);
  if (!tr) { tr = ls[Math.min(cursorIdx, ls.length - 1)]; cursor = chaveTr(tr); }
  cursorIdx = ls.indexOf(tr);
  ls.forEach(x => x.classList.toggle('cursor', x === tr));
}
// rola só na vertical: com a tabela mais larga que a área, o scrollIntoView também empurrava a tela para o lado
function rolarAte(tr, block) {
  const p = document.querySelector('.principal'), x = p ? p.scrollLeft : 0;
  tr.scrollIntoView({ block });
  if (p) p.scrollLeft = x;
}
function moverCursor(passo) {
  const ls = linhasNav(); if (!ls.length) return;
  cursorIdx = Math.max(0, Math.min(ls.length - 1, cursorIdx + passo)); cursor = chaveTr(ls[cursorIdx]);
  marcarCursor(); rolarAte(ls[cursorIdx], 'nearest');
}
document.addEventListener('keydown', e => {
  if (!ROTULOS || e.ctrlKey || e.metaKey || e.altKey) return;
  if (digitando() || document.querySelector('.modal-fundo.aberto')) return;
  if (document.activeElement.type === 'checkbox' && e.key === ' ') return;   // Espaço numa caixa de marcar: deixa o navegador marcar
  const tr = linhasNav().find(x => chaveTr(x) === cursor);
  const k = e.key;
  if (k === 'ArrowDown' || k === 'j') moverCursor(1);
  else if (k === 'ArrowUp' || k === 'k') moverCursor(-1);
  else if (k === ']') irConta(1);
  else if (k === '[') irConta(-1);
  else if (k === 'c' && candLista.length) irCandidato();
  else if (k === ' ' && tr) tr.click();
  else if (k === 'Enter') {
    if (marcados.size && $('agrupar') && !$('agrupar').disabled) $('agrupar').click();
    else if (tr) { const b = tr.querySelector('[data-primario]'); if (b) b.click(); else return; }
    else return;
  } else if ((k === 'x' || k === 'Delete') && tr) { const b = tr.querySelector('[data-desfazer]'); if (b) b.click(); else return; }
  else return;
  e.preventDefault();
});

function barra() {
  const ls = atual.lanc.filter(l => marcados.has(l.id));
  if (!ls.length) { $('barra').style.display = 'none'; return; }
  const s = soma(ls), fecha = Math.abs(s) <= TOLERANCIA;
  $('barra').style.display = 'flex';
  $('barra').innerHTML = `<span>${ls.length} marcados</span><span>Débitos ${fmt(deb(ls))}</span><span>Créditos ${fmt(cred(ls))}</span>
    <span class="${fecha ? 'dif0' : 'difx'}">Diferença ${fmt(s)}</span>
    ${candLista.length ? `<button class="cand-ir" id="cand-ir" title="Leva ao próximo candidato (tecla C)">${candLista.length} ${candPar ? (candLista.length === 1 ? 'par fecha' : 'pares fecham') : (candLista.length === 1 ? 'lançamento fecha' : 'lançamentos fecham')} a diferença ▸</button>` : ''}
    <button class="secundario" style="margin-left:auto" id="limpar">Limpar</button><button class="verde" id="agrupar" ${fecha ? '' : 'disabled'}>Agrupar</button>`;
  if ($('cand-ir')) $('cand-ir').onclick = irCandidato;
  $('limpar').onclick = () => { marcados.clear(); render(); };
  $('agrupar').onclick = () => { const err = agrupar(atual, marcados); if (err) return alerta(err, 'erro'); marcados.clear(); alerta('Grupo criado.', '', true); listar(); render(); };
}

function expandir() {
  if (MODO === 'cp-nivel') document.querySelectorAll('tr.sub').forEach(tr => abertosUI.add(tr.dataset.k));
  else grupos(atual).forEach(x => abertosUI.add(x.g));
  render();
}

montarCabecalho('Conciliação contábil');
(function () {   // botão Desfazer no topo, à esquerda do Excel
  const ex = document.querySelector('.toolbar button[onclick="exportarExcel()"]');
  if (ex) { ex.insertAdjacentHTML('beforebegin', '<button class="secundario" id="btn-undo" disabled>↶ Desfazer</button>'); document.getElementById('btn-undo').onclick = desfazerUltima; }
  if (ex && ROTULOS) { ex.insertAdjacentHTML('afterend', '<button class="secundario" id="btn-reg" title="Quem fez o quê e quando">🕘 Registro</button>'); document.getElementById('btn-reg').onclick = verRegistro; }
})();
opcoesGrupo($('f-grupo'), '2.1.1.01');
$('abrir-todos').onclick = expandir;
$('fechar-todos').onclick = () => { abertosUI.clear(); render(); };
// () => listar(): chama a listar ATUAL (nfse.js a substitui para pôr o item "NFS-e sem conta"); ligar a função direto prendia a original
['f-grupo', 'f-pend'].forEach(id => $(id).onchange = () => listar());
$('f-busca').oninput = () => listar();
listar();
