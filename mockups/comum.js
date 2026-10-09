// Mockup: estado e regras compartilhados pelas 3 telas. Nada aqui é o motor final.
const D = window.DADOS;
const TOLERANCIA = 0.05; // diferença de centavos aceita num grupo (vira sugestão)

const fmt = v => (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const soma = ls => Math.round(ls.reduce((a, l) => a + l.v, 0) * 100) / 100;
const $ = id => document.getElementById(id);

// saldo anterior vira item em aberto (é o que veio do período anterior)
D.contas.forEach((c, i) => {
  c.i = i;
  if (Math.abs(c.saldo_ant) > 0.004)
    c.lanc.unshift({ id: -1, data: '31/12/25', hist: 'SALDO ANTERIOR (itens em aberto até 31/12/2025)', cp: '', v: c.saldo_ant, g: null, m: null, ant: true });
});

// cada página guarda as próprias ações no navegador, para o teste com usuários
const CHAVE = 'mock-conciliacao-' + location.pathname.split('/').pop();
function salvar() {
  const s = {};
  D.contas.forEach(c => { if (c.mexida) s[c.i] = c.lanc.map(l => [l.id, l.g, l.m]); });
  try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch (e) {}
}
function restaurar() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch (e) {}
  for (const [i, ls] of Object.entries(s)) {
    const c = D.contas[i]; c.mexida = true;
    const porId = new Map(c.lanc.map(l => [l.id, l]));
    ls.forEach(([id, g, m]) => { const l = porId.get(id); if (l) { l.g = g; l.m = m; } });
  }
}
// zera só o que é desta tela: conciliação e registro dela, mais ajuste/NFS-e quando for a V1 (as outras telas compartilham esses dois)
function zerarTudo() {
  try {
    [CHAVE, 'mock-log-' + location.pathname.split('/').pop()].forEach(k => localStorage.removeItem(k));
    if (window.TELA_V1) Object.keys(localStorage).filter(k => k.startsWith('mock-') && k.endsWith('-v1')).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  location.reload();
}
restaurar();

// status do grupo: doc = automático; centavos/valor = sugestão; aceito; manual
const STATUS = { doc: 'auto', centavos: 'sugestao', valor: 'sugestao', aceito: 'auto', manual: 'manual', ajuste: 'auto' };
const MOTIVO = { doc: 'mesmo nº de documento', centavos: 'mesmo documento, diferença de centavos', valor: 'mesmo valor, sem documento em comum', aceito: 'sugestão aceita', manual: 'agrupado manualmente', ajuste: 'centavos fechados com ajuste a lançar' };

function grupos(c) {
  const m = new Map();
  c.lanc.forEach(l => { if (l.g != null) { if (!m.has(l.g)) m.set(l.g, []); m.get(l.g).push(l); } });
  return [...m.entries()].map(([g, ls]) => ({ g, ls, soma: soma(ls), m: ls[0].m, st: STATUS[ls[0].m], nome: nomeGrupo(g, ls) }));
}
function nomeGrupo(g, ls) {
  for (const l of ls) { const x = /(?:NOTA|NF)\s*0*(\d+)/i.exec(l.hist); if (x) return 'Nota ' + x[1]; }
  for (const l of ls) { const x = /\b0*(\d{3,})\b/.exec(l.hist); if (x) return 'Doc ' + x[1]; }
  return 'Grupo ' + g;
}
const abertos = c => c.lanc.filter(l => l.g == null);
function resumo(c) {
  const gs = grupos(c);
  const ab = abertos(c);
  return {
    abertos: ab.length, somaAbertos: soma(ab),
    sugestoes: gs.filter(x => x.st === 'sugestao').length,
    saldo: Math.round((c.saldo_ant + soma(c.lanc.filter(l => !l.ant))) * 100) / 100,
    mov: soma(c.lanc.filter(l => !l.ant)),
  };
}

function agrupar(c, ids) {
  const ls = c.lanc.filter(l => ids.has(l.id));
  if (ls.length < 2) return 'Marque pelo menos 2 lançamentos.';
  const s = soma(ls);
  if (Math.abs(s) > TOLERANCIA) return 'A soma dos marcados é ' + fmt(s) + '. Um grupo só fecha quando soma zero (tolerância de centavos: ' + fmt(TOLERANCIA) + ').';
  const g = Math.max(0, ...c.lanc.map(l => l.g || 0)) + 1;
  snap(c, 'agrupar ' + ls.length + ' lançamentos', g);
  ls.forEach(l => { l.g = g; l.m = 'manual'; });
  c.mexida = true; salvar();
  return null;
}
function desfazer(c, g) {
  const ls = c.lanc.filter(l => l.g === g);
  if (ls.length) snap(c, (STATUS[ls[0].m] === 'sugestao' ? 'recusar ' : 'desfazer ') + nomeGrupo(g, ls), g);
  if (window.AJ_HOOK && window.AJ_HOOK.remover) window.AJ_HOOK.remover(c, g);   // grupo desfeito leva o ajuste junto
  c.lanc.forEach(l => { if (l.g === g) { l.g = null; l.m = null; } }); c.mexida = true; salvar();
}
function aceitar(c, g) {
  const ls = c.lanc.filter(l => l.g === g);
  if (ls.length) snap(c, 'aceitar ' + nomeGrupo(g, ls), g);
  c.lanc.forEach(l => { if (l.g === g) l.m = 'aceito'; }); c.mexida = true; salvar();
}

// ---- desfazer: pilha em memória (aceitar, recusar, desfazer grupo, agrupar à mão, ajuste e NFS-e). Botão no topo, Ctrl+Z e link no aviso.
// Outros módulos (ajuste, NFS-e) registram em EXTRAS o próprio estado {get, set, refresh} para entrar no mesmo desfazer.
const PILHA = [], EXTRAS = [];
window.AJ_HOOK = null;   // ajuste.js registra {abrir, tem, rapido, remover, lista}
// registro de ações: append-only, quem e quando (no sistema real vem do login e fica na base)
const QUEM = 'você';
const CHAVE_LOG = 'mock-log-' + location.pathname.split('/').pop();
let LOG = [];
try { LOG = JSON.parse(localStorage.getItem(CHAVE_LOG) || '[]'); } catch (e) {}
function registrar(rotulo, c, g) {
  LOG.push({ t: new Date().toISOString(), quem: QUEM, i: c ? c.i : null, g: g == null ? null : g, rotulo });
  try { localStorage.setItem(CHAVE_LOG, JSON.stringify(LOG)); } catch (e) {}
}
const quando = t => { const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const ultimoRegistro = (c, g) => { for (let k = LOG.length - 1; k >= 0; k--) if (LOG[k].i === c.i && LOG[k].g === g) return LOG[k]; return null; };
function snap(c, rotulo, g) {
  PILHA.push({ i: c ? c.i : null, estado: c ? c.lanc.map(l => [l.id, l.g, l.m]) : null, ex: EXTRAS.map(h => h.get()), rotulo });
  if (PILHA.length > 50) PILHA.shift();
  registrar(rotulo, c, g);
  atualizarDesfazer();
}
function atualizarDesfazer() {
  const b = document.getElementById('btn-undo'); if (!b) return;
  const u = PILHA[PILHA.length - 1];
  b.disabled = !u;
  b.textContent = u ? '↶ Desfazer: ' + (u.rotulo.length > 30 ? u.rotulo.slice(0, 29) + '…' : u.rotulo) : '↶ Desfazer';
  b.title = u ? 'Desfazer: ' + u.rotulo + ' (Ctrl+Z)' : 'Nada para desfazer';
}
function desfazerUltima() {
  const u = PILHA.pop(); if (!u) return;
  const c = u.i == null ? null : D.contas[u.i];
  if (c) {
    const por = new Map(c.lanc.map(l => [l.id, l]));
    u.estado.forEach(([id, g, m]) => { const l = por.get(id); if (l) { l.g = g; l.m = m; } });
    c.mexida = true; salvar();
  }
  EXTRAS.forEach((h, k) => h.set(u.ex[k]));
  registrar('desfez: ' + u.rotulo, c, null);
  alerta('Desfeito: ' + u.rotulo + '.', 'info');
  atualizarDesfazer();
  if (c && typeof abrir === 'function' && typeof atual !== 'undefined' && atual !== c) abrir(c);
  else if (typeof render === 'function') { if (typeof listar === 'function') listar(); render(); }
  EXTRAS.forEach(h => h.refresh && h.refresh());
}
function verRegistro() {
  let m = document.getElementById('reg-modal');
  if (!m) {
    document.body.insertAdjacentHTML('beforeend', '<div id="reg-modal" style="position:fixed;inset:0;background:rgba(20,30,45,.45);z-index:250;display:flex;align-items:flex-start;justify-content:center;padding-top:7vh"><div style="background:#fff;border-radius:10px;width:min(760px,94vw);max-height:80vh;overflow:auto;padding:16px 20px" id="reg-corpo"></div></div>');
    m = document.getElementById('reg-modal');
    m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
  }
  m.style.display = 'flex';
  document.getElementById('reg-corpo').innerHTML = `<b style="font-size:15px">Registro de ações (${LOG.length})</b>
    <div class="muted" style="margin:4px 0 10px">Tudo o que foi feito nesta empresa, de qualquer analista. Nunca é apagado; desfazer também fica registrado.</div>
    <table><tr><th>Quando</th><th>Quem</th><th>Conta</th><th>Ação</th></tr>${LOG.slice().reverse().map(r => `<tr><td>${quando(r.t)}</td><td>${esc(r.quem)}</td><td>${r.i == null ? '' : esc(D.contas[r.i].nome)}</td><td>${esc(r.rotulo)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nada ainda.</td></tr>'}</table>
    <div style="text-align:right;margin-top:12px"><button class="secundario" onclick="document.getElementById('reg-modal').style.display='none'">Fechar</button></div>`;
}
// atalhos ignoram só campos de DIGITAR: uma caixa de marcar com foco (filtro, lançamento) não pode travar o Ctrl+Z
const digitando = () => { const a = document.activeElement; return /TEXTAREA|SELECT/.test(a.tagName) || (a.tagName === 'INPUT' && !/checkbox|radio|button/.test(a.type)); };
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !digitando()) { e.preventDefault(); desfazerUltima(); }
});

function alerta(txt, tipo, comDesfazer) {
  document.querySelectorAll('.alerta').forEach(x => x.remove());   // um aviso por vez
  const d = document.createElement('div');
  d.className = 'alerta ' + (tipo || '') + (comDesfazer && window.TELA_V1 ? ' desfazer' : ''); d.textContent = txt;
  if (comDesfazer) {
    const a = document.createElement('a'); a.href = '#'; a.textContent = window.TELA_V1 ? '↶ Desfazer' : 'Desfazer';
    a.style.cssText = window.TELA_V1 ? '' : 'margin-left:10px;font-weight:700;color:inherit;text-decoration:underline';
    a.onclick = e => { e.preventDefault(); d.remove(); desfazerUltima(); };
    d.appendChild(a);
  }
  document.body.appendChild(d);
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 300); }, comDesfazer ? 8000 : 3500);
}

// cabeçalho comum (menu hambúrguer liga as 3 versões)
const PAGINAS = [
  ['tela-a-agrupada.html', 'A · Contas + grid agrupada'],
  ['tela-a1-contrapartida.html', 'A1 · com descrição da contrapartida'],
  ['tela-a2-contrapartida-nivel.html', 'A2 · contrapartida como subnível'],
  ['tela-aj-ajuste.html', 'AJ · A1 com ajuste a lançar no IGC'],
  ['tela-n1-nfse-aba.html', 'N1 · NFS-e: aba na lista de contas'],
  ['tela-n2-nfse-card.html', 'N2 · NFS-e: faixa no topo + tela própria'],
  ['tela-n3-nfse-contextual.html', 'N3 · NFS-e: dentro da conta do fornecedor'],
  ['tela-n4-nfse-combinado.html', 'N4 · NFS-e: faixa + dentro da conta (N2 com N3)'],
  ['tela-n5-a-lancar.html', 'N5 · A lançar no IGC (NFS-e + ajustes unificados)'],
  ['tela-v1-conciliacao.html', 'V1 · tela única para o teste com analistas'],
  ['tela-b-duas-colunas.html', 'B · Créditos × Débitos'],
  ['tela-c-grid-unica.html', 'C · Grid única com grupos'],
];
function montarCabecalho(titulo) {
  const atual = location.pathname.split('/').pop();
  document.body.insertAdjacentHTML('afterbegin', `
<header>
  <button class="hamburger" id="btn-nav" title="Menu">☰</button>
  <h1>${esc(titulo)}</h1>
  <span class="empresa">${esc(D.empresa)} · CNPJ ${esc(D.cnpj_empresa || '')} · IGC ${esc(D.igc)}</span>
  <span class="version">mockup · v0.0.1</span>
  <div id="nav"><div class="sb-title">Versões da tela (mockup)</div>
    ${PAGINAS.map(([h, t]) => `<a href="${h}" class="${h === atual ? 'atual' : ''}"><span class="dot"></span>${esc(t)}</a>`).join('')}
    <div class="sb-title" style="margin-top:12px">Teste</div>
    <a href="#" id="zerar"><span class="dot"></span>Desfazer tudo o que fiz nesta tela</a>
  </div>
</header>
<div class="mock-aviso">Mockup com dados reais do razão e do balancete IGC (01/01 a 31/07/2026). O pareamento automático é um protótipo; suas ações ficam salvas só neste navegador.</div>`);
  $('btn-nav').onclick = e => { e.stopPropagation(); $('nav').classList.toggle('aberto'); };
  document.addEventListener('click', e => { if (!$('nav').contains(e.target)) $('nav').classList.remove('aberto'); });
  $('zerar').onclick = e => { e.preventDefault(); if (confirm('Voltar esta tela ao pareamento automático original?')) zerarTudo(); };
}

function opcoesGrupo(sel, padrao) {
  const usados = new Set(D.contas.map(c => c.cls.slice(0, 8)));
  sel.innerHTML = '<option value="">Todos os grupos</option>' + Object.entries(D.grupos)
    .filter(([k]) => usados.has(k))
    .map(([k, v]) => `<option value="${k}" ${k === padrao ? 'selected' : ''}>${k} ${esc(v)}</option>`).join('');
}
const contasDoGrupo = g => D.contas.filter(c => c.lanc.length && (!g || c.cls.startsWith(g)));
function exportarExcel() { alerta('No sistema real, baixa a planilha de conciliação (o mockup do Excel vem a seguir).', 'info'); }
