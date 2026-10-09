// Mockup: "NFS-e recebidas sem lançamento no razão", em 3 desenhos (window.NFSE_MODO = 'aba' | 'card' | 'contextual').
// Dados: 418 NFS-e tomadas jan a jul/2026 do nfts, cruzadas por número com o razão; sobraram 5.
(function () {
  const NF = window.NFSE_NAO || [];
  const MODO = window.NFSE_MODO;
  const N5 = MODO === 'n5', CMB = MODO === 'combinado' || N5, IC = N5 ? '📝' : '🧾';
  const KEY = 'mock-nfse-' + MODO + (window.TELA_V1 ? '-v1' : '');
  let est = {};
  try { est = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const gravar = () => { try { localStorage.setItem(KEY, JSON.stringify(est)); } catch (e) {} };
  const id = n => n.numero + '|' + n.cnpj;
  const pend = () => NF.filter(n => !(est[id(n)] && est[id(n)].st));
  const trat = () => NF.filter(n => est[id(n)] && est[id(n)].st);
  const cnpjFmt = c => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const dataBR = d => d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4);
  const fornecedores = D.contas.filter(c => c.cls.startsWith('2.1.1.01')).sort((a, b) => a.nome.localeCompare(b.nome));
  const contaDe = n => {
    const red = (est[id(n)] && est[id(n)].conta) || (n.conta_sugerida && n.conta_sugerida.red);
    return red ? D.contas.find(c => c.red === red) : null;
  };
  const somaB = ls => Math.round(ls.reduce((a, n) => a + n.bruto, 0) * 100) / 100;
  // ajustes de centavos (do ajuste.js): grupos com diferença de centavos, em todas as contas
  const ajGlobais = () => (window.AJ_HOOK ? window.AJ_HOOK.lista() : []);
  const V1 = !!window.TELA_V1;
  let faixaFn = null, abrirTelaFn = null;   // faixa do topo (V1): redesenha a cada ação na conta; abre a tela "o que falta lançar"
  EXTRAS.push({ get: () => JSON.stringify(est), set: s => { est = JSON.parse(s); gravar(); }, refresh: () => aposAcao() });
  const somaAj = ls => Math.round(ls.reduce((t, a) => t + Math.abs(a.x.soma), 0) * 100) / 100;

  const css = document.createElement('style');
  css.textContent = `
    .faixa { display:flex; align-items:center; gap:14px; padding:8px 20px; background:#fff8e1; border-bottom:1px solid #f3e2a9; color:#6b4e00; font-size:13px; }
    .faixa b { color:#1f2430; } .faixa button { margin-left:auto; }
    .abas { display:flex; gap:6px; padding:10px 10px 0; }
    .abas button { flex:1; border-radius:99px; background:#fff; color:#1a3c5e; font-weight:500; }
    .abas button.ativo { background:#1a3c5e; color:#fff; }
    .abas .n { background:#f9a825; color:#5a4000; border-radius:99px; padding:0 7px; margin-left:4px; font-weight:700; font-size:11px; }
    tr.fantasma td { background:#fffdf4; border-top:1px dashed #d9a441; border-bottom:1px dashed #d9a441; color:#5a4a1a; }
    .tag.nfse { background:#fff4e0; color:#8a5a00; border:1px dashed #d9a441; }
    .nf-tab td, .nf-tab th { vertical-align:middle; }
    .nf-det { display:grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap:12px 24px; margin:10px 0; }
    .nf-det small { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#888; }
    .nf-det b { font-size:14px; }
    .nf-acoes { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
    select.nf-conta { max-width:260px; }
    .nota-rodape { font-size:11px; color:#888; margin-top:8px; }
  `;
  document.head.appendChild(css);
  if (N5) {   // um só estilo (azul tracejado) para tudo que precisa ser lançado no IGC
    const c5 = document.createElement('style');
    c5.textContent = `
      .faixa { background:#eef6ff; border-bottom-color:#b9d6f2; color:#27415c; }
      tr.fantasma td { background:#f3f9ff; border-top:1px dashed #5b9bd5; border-bottom:1px dashed #5b9bd5; color:#27415c; }
      .tag.nfse { background:#e3f2fd; color:#0d47a1; border:1px dashed #5b9bd5; }`;
    document.head.appendChild(c5);
  }

  const opcoesConta = n => {
    const sel = contaDe(n);
    return `<option value="">(sem conta: cadastrar fornecedor)</option>` + fornecedores.map(c =>
      `<option value="${c.red}" ${sel && sel.red === c.red ? 'selected' : ''}>${esc(c.nome)} · ${c.red}</option>`).join('');
  };
  const botoes = (n, tratada) => V1 ? (tratada
    ? `<button class="btn-txt" data-nf="desfazer" data-id="${esc(id(n))}" title="Voltar para a lista">↶ Voltar</button>`
    : `<button class="btn-txt excluir" data-nf="ignorar" data-id="${esc(id(n))}" title="Não precisa ser lançada (informe o motivo)">Ignorar</button><span class="sep"></span><button class="btn-txt" data-nf="pdf" data-id="${esc(id(n))}" title="Abrir o PDF (DANFSe) da NFS-e">📄 PDF</button>${contaDe(n) ? ` <button class="btn-txt ok" data-nf="lancada" data-id="${esc(id(n))}" title="Já lancei no IGC: sai da lista na próxima importação">✓ Já lancei</button>` : ''}`)
    : tratada
    ?`<button class="btn-icone" data-nf="desfazer" data-id="${esc(id(n))}" title="Voltar para a lista">↶</button>`
    : `<button class="btn-icone" data-nf="pdf" data-id="${esc(id(n))}" title="Abrir o PDF (DANFSe) da NFS-e">📄</button>
       <button class="btn-icone" data-nf="lancada" data-id="${esc(id(n))}" title="Já lancei no IGC: sai da lista na próxima importação">✓</button>
       <button class="btn-icone excluir" data-nf="ignorar" data-id="${esc(id(n))}" title="Ignorar: não precisa ser lançada (informe o motivo)">✕</button>`;

  function tabelaNotas(ls, tratadas) {
    if (!ls.length) return `<div class="muted" style="padding:14px">${tratadas ? 'Nenhuma nota tratada.' : 'Nenhuma NFS-e pendente. ✓'}</div>`;
    return `<table class="nf-tab"><tr><th></th><th>Emissão</th><th>NFS-e</th><th>Prestador</th><th class="n">Bruto</th><th class="n">Retenções</th><th class="n">Líquido (pagamento)</th><th>Conta de fornecedor</th></tr>` +
      ls.map(n => `<tr><td style="white-space:nowrap">${botoes(n, tratadas)}${CMB && !tratadas && contaDe(n) ? ` <button class="${V1 ? 'btn-txt' : 'btn-icone'}" data-nf="irconta" data-id="${esc(id(n))}" title="Abrir a conta do fornecedor: a nota aparece como linha a lançar">📂${V1 ? ' Abrir conta' : ''}</button>` : ''}</td><td>${dataBR(n.data)}</td><td><b>${esc(n.numero)}</b></td>
        <td>${esc(n.prestador)}<div class="muted" style="font-size:11px">${cnpjFmt(n.cnpj)}</div></td>
        <td class="n">${fmt(n.bruto)}</td><td class="n">${n.ret ? fmt(n.ret) : ''}</td><td class="n"><b>${fmt(n.liq)}</b></td>
        <td>${tratadas ? esc(est[id(n)].st === 'ignorada' ? 'ignorada' : 'lançada no IGC') : `<select class="nf-conta" data-id="${esc(id(n))}">${opcoesConta(n)}</select>`}</td></tr>`).join('') + '</table>';
  }

  // ---- ações (delegadas)
  const hooks = [];
  const aposAcao = () => hooks.forEach(f => f());
  document.addEventListener('click', e => {
    const o5 = e.target.closest('[data-n5conta]'); if (o5) { window.dispatchEvent(new CustomEvent('nf-irconta', { detail: o5.dataset.n5conta })); return; }
    const b = e.target.closest('[data-nf]'); if (!b) return;
    const n = NF.find(x => id(x) === b.dataset.id); const a = b.dataset.nf;
    if (a === 'irconta') { window.dispatchEvent(new CustomEvent('nf-irconta', { detail: contaDe(n).red })); return; }
    if (a === 'pdf') return alerta('No sistema real: abre o PDF (DANFSe) da NFS-e ' + n.numero + ' pelo nfts.', 'info');
    const cc = contaDe(n);
    if (a === 'lancada') { snap(cc, 'NFS-e ' + n.numero + ': já lancei no IGC', null); est[id(n)] = Object.assign(est[id(n)] || {}, { st: 'lancada' }); alerta('Marcada como lançada no IGC. Some da lista quando o razão novo trouxer o lançamento.', '', true); }
    if (a === 'ignorar') { const m = prompt('Motivo para ignorar a NFS-e ' + n.numero + ':', 'Despesa paga por cartão da empresa'); if (m === null) return; snap(cc, 'NFS-e ' + n.numero + ': ignorada (' + m + ')', null); est[id(n)] = Object.assign(est[id(n)] || {}, { st: 'ignorada', motivo: m }); alerta('NFS-e ignorada.', 'info', true); }
    if (a === 'desfazer') { snap(cc, 'NFS-e ' + n.numero + ': voltou para a lista', null); delete est[id(n)].st; }
    gravar(); aposAcao();
  });
  document.addEventListener('change', e => {
    const s = e.target.closest('select.nf-conta'); if (!s) return;
    const n = NF.find(x => id(x) === s.dataset.id);
    snap(contaDe(n), 'NFS-e ' + n.numero + ': conta do fornecedor ' + (s.value || '(nenhuma)'), null);
    est[id(n)] = Object.assign(est[id(n)] || {}, { conta: s.value || null }); gravar(); aposAcao();
  });

  // V1: a lista mostra tudo; no topo o que pede ação (nota sem conta de fornecedor), embaixo as tratadas, abertas
  const ordenar = ls => V1 ? [...ls].sort((a, b) => !!contaDe(a) - !!contaDe(b)) : ls;
  const painelNotasBase = (titulo, ls) => (ls = ordenar(ls), `<div class="cartao"><b style="font-size:15px">${titulo}</b>
    <div class="muted" style="margin-top:4px">Procurei o número de cada NFS-e recebida (nfts, emissão 01/01 a 31/07/2026, não canceladas) no histórico de todas as contas do razão. Das 418 NFS-e recebidas no período, ${NF.length} não apareceram no razão${ls.length !== NF.length ? `; esta lista mostra ${ls.length}` : ''}.</div></div>
    <div style="margin-top:12px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:auto">${tabelaNotas(ls, false)}</div>
    ${trat().length ? `<details style="margin-top:12px" ${V1 ? 'open' : ''}><summary class="muted" style="cursor:pointer">Tratadas (${trat().length})</summary><div style="background:#fff;border-radius:8px;margin-top:6px">${tabelaNotas(trat(), true)}</div></details>` : ''}
    <div class="nf-acoes"><button class="secundario" onclick="alerta('No sistema real: baixa a lista em Excel.','info')">⬇ Excel</button></div>`);
  const blocoAjustes = () => {
    const aj = ajGlobais(); if (!aj.length) return '';
    const por = new Map(); aj.forEach(a => { if (!por.has(a.c)) por.set(a.c, []); por.get(a.c).push(a); });
    return `<div class="cartao" style="margin-top:14px"><b style="font-size:15px">Ajustes de centavos (${aj.length})</b>
      <div class="muted" style="margin-top:4px">Grupos em que a nota e o pagamento diferem por centavos. Cada um precisa de um lançamento de ajuste no IGC.</div></div>
      <div style="margin-top:12px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:auto"><table class="nf-tab"><tr><th></th><th>Conta</th><th class="n">Ajustes</th><th class="n">Total</th></tr>` +
      [...por].map(([c, ls]) => `<tr><td><button class="${V1 ? 'btn-txt' : 'btn-icone'}" data-n5conta="${c.red}" title="Abrir a conta">📂${V1 ? ' Abrir conta' : ''}</button></td><td>${esc(c.nome)}<div class="muted" style="font-size:11px">${c.cls} · ${c.red}</div></td><td class="n">${ls.length}</td><td class="n">${fmt(somaAj(ls))}</td></tr>`).join('') + '</table></div>' +
      `<div class="nf-acoes"><button class="verde" onclick="document.getElementById('aj-bandeja').click()">⬇ Baixar CSV para o IGC</button></div>`;
  };
  const painelNotas = (titulo, ls) => painelNotasBase(titulo, ls) + (N5 && titulo.startsWith('A lançar') ? blocoAjustes() : '');

  // ================= desenho 1: aba na lista da esquerda + detalhe à direita
  function modoAba() {
    const lateral = document.querySelector('.lateral'), conteudo = document.querySelector('.principal .conteudo');
    const abas = document.createElement('div'); abas.className = 'abas';
    lateral.insertBefore(abas, lateral.firstChild);
    const painel = document.createElement('div'); painel.id = 'nf-painel'; painel.style.display = 'none'; conteudo.appendChild(painel);
    let aba = 'contas', sel = null;
    const filhos = () => [...conteudo.children].filter(x => x !== painel);

    function desenharAbas() {
      abas.innerHTML = `<button class="${aba === 'contas' ? 'ativo' : ''}" data-aba="contas">Contas</button>
        <button class="${aba === 'nfse' ? 'ativo' : ''}" data-aba="nfse">NFS-e sem lançamento <span class="n">${pend().length}</span></button>`;
      abas.querySelectorAll('button').forEach(b => b.onclick = () => { aba = b.dataset.aba; mostrar(); });
    }
    function mostrar() {
      desenharAbas();
      const nf = aba === 'nfse';
      lateral.querySelector('.filtros').style.display = nf ? 'none' : '';
      $('contagem').style.display = nf ? 'none' : '';
      filhos().forEach(x => x.style.display = nf ? 'none' : '');
      $('barra').style.display = 'none';
      painel.style.display = nf ? '' : 'none';
      if (!nf) { listar(); render(); return; }
      const ls = pend();
      if (!sel || !ls.includes(sel)) sel = ls[0] || null;
      $('lista').innerHTML = (ls.map(n => `<div class="item ${sel === n ? 'atual' : ''}" data-id="${esc(id(n))}">
          <div class="nome">${esc(n.prestador)}</div>
          <div class="sub"><span>NFS-e ${esc(n.numero)} · ${dataBR(n.data)}</span><span class="n">${fmt(n.bruto)}</span></div>
          <div class="sub" style="justify-content:flex-start">${contaDe(n) ? '<span class="tag zerada">conta identificada</span>' : '<span class="tag aberto">sem conta de fornecedor</span>'}</div></div>`).join('')
        || '<div class="contagem">Nenhuma NFS-e pendente. ✓</div>')
        + (trat().length ? `<div class="contagem">${trat().length} tratadas</div>` : '');
      $('lista').querySelectorAll('.item').forEach(el => el.onclick = () => { sel = NF.find(x => id(x) === el.dataset.id); mostrar(); });
      painel.innerHTML = sel ? detalhe(sel) : '<div class="cartao muted">Nada pendente. ✓</div>';
    }
    function detalhe(n) {
      const c = contaDe(n);
      return `<div class="cartao"><div><b style="font-size:15px">NFS-e ${esc(n.numero)}</b> <span class="tag nfse">sem lançamento no razão</span></div>
        <div class="nf-det">
          <div><small>Prestador</small><b>${esc(n.prestador)}</b><div class="muted">${cnpjFmt(n.cnpj)}</div></div>
          <div><small>Emissão</small><b>${dataBR(n.data)}</b></div>
          <div><small>Valor bruto</small><b>${fmt(n.bruto)}</b></div>
          <div><small>Retenções</small><b>${fmt(n.ret)}</b></div>
          <div><small>Líquido (pagamento esperado)</small><b>${fmt(n.liq)}</b></div>
        </div>
        <div><small class="muted">CONTA DE FORNECEDOR NO PLANO</small><br><select class="nf-conta" data-id="${esc(id(n))}">${opcoesConta(n)}</select>
          ${c ? '' : '<span class="tag aberto" style="margin-left:8px">fornecedor sem conta: cadastrar no IGC antes de lançar</span>'}</div>
        <div class="nf-acoes">${botoes(n, false)}<span class="muted" style="align-self:center">📄 PDF · ✓ já lancei no IGC · ✕ ignorar</span></div>
        <div class="nota-rodape">Procurei o número ${esc(n.numero)} no histórico das 15.289 linhas de todas as contas do razão e não achei.</div></div>`;
    }
    hooks.push(mostrar);
    mostrar();
  }

  // ================= desenho 2: faixa no topo que abre uma tela dedicada
  function modoCard() {
    const app = document.querySelector('.app');
    const faixa = document.createElement('div'); faixa.className = 'faixa'; faixa.id = 'faixa-nfse';
    app.parentNode.insertBefore(faixa, app);
    const tela = document.createElement('div'); tela.id = 'nf-tela'; tela.style.cssText = 'display:none;padding:14px 20px;height:calc(100vh - 150px);overflow:auto';
    app.parentNode.insertBefore(tela, app);
    let aberta = false;
    function desenhar() {
      const ls = pend();
      faixa.style.display = ls.length || aberta ? '' : 'none';
      faixa.innerHTML = aberta
        ? `<b>NFS-e recebidas sem lançamento</b><span>${ls.length} pendentes</span><button class="secundario" id="nf-voltar">← Voltar às contas</button>`
        : `<span>${IC} <b>${ls.length} NFS-e recebidas</b> sem lançamento no razão · bruto <b>${fmt(somaB(ls))}</b>${CMB ? ` · ${ls.filter(contaDe).length} em contas identificadas, ${ls.filter(n => !contaDe(n)).length} sem conta de fornecedor` : ''}</span><button id="nf-abrir">Ver as ${ls.length} notas ▸</button>`;
      if (V1) {   // item 17: quanto falta para fechar a empresa inteira; item 13: cobertura do nfts (quieta quando ok)
        const aj = ajGlobais(), cs = D.contas.filter(c => c.lanc.length).map(c => ({ c, r: resumo(c) }));
        // conta fechada não conta como pendência: os itens em aberto dela são saldo atestado
        const fe = cs.filter(x => fechada(x.c)), vivas = cs.filter(x => !fechada(x.c));
        const pc = vivas.filter(x => x.r.abertos || x.r.sugestoes || (window.PEND_EXTRA && window.PEND_EXTRA(x.c))).length;
        const ab = vivas.reduce((t, x) => t + x.r.abertos, 0), sg = vivas.reduce((t, x) => t + x.r.sugestoes, 0), al = ls.length + aj.length;
        const cob = window.NFTS_COBERTURA || {}, fim = window.PERIODO_FIM || '';
        const cobOk = cob.ultima_sincronizacao_ok && cob.tem_certificado && (cob.ultima_data_emissao || '') >= fim;
        const cobTxt = cobOk ? `<span class="muted" title="Última sincronização com o Portal Nacional: ${esc(cob.ultima_sincronizacao)} (ok). Notas até ${esc(cob.ultima_data_emissao)}.">NFS-e do nfts cobrem o período ✓</span>`
          : `<span class="tag aberto" title="${esc(cob.ultima_sincronizacao_erro || '')}">⚠ NFS-e do nfts podem estar incompletas (${!cob.tem_certificado ? 'empresa sem certificado' : !cob.ultima_sincronizacao_ok ? 'última sincronização falhou' : 'notas só até ' + esc(cob.ultima_data_emissao || '?')}): "nota não achada" não é conclusiva</span>`;
        faixa.style.display = '';
        faixa.innerHTML = aberta
          ? `<b>A lançar no IGC</b><span>${ls.length} NFS-e · ${aj.length} ajustes de centavos</span><button class="secundario" id="nf-voltar">← Voltar às contas</button>`
          : `<span>${pc ? `Falta para fechar o período: <b>${pc}</b> de ${cs.length} contas · <b>${ab}</b> itens em aberto · <b>${sg}</b> sugestões · <b>${al}</b> a lançar no IGC (${ls.length} NFS-e, ${aj.length} ajustes)${fe.length ? ` · <b>${fe.length}</b> ${fe.length === 1 ? 'conta fechada' : 'contas fechadas'}` : ''}` : '<b>✓ Período conciliado</b>'}</span>${cobTxt}${al ? '<button id="nf-abrir">Ver o que falta lançar ▸</button>' : ''}`;
        if (!al && !aberta) faixa.querySelector('span:last-of-type').style.marginLeft = 'auto';
      } else if (N5) {
        const aj = ajGlobais();
        faixa.style.display = (ls.length || aj.length || aberta) ? '' : 'none';
        faixa.innerHTML = aberta
          ? `<b>A lançar no IGC</b><span>${ls.length} NFS-e · ${aj.length} ajustes de centavos</span><button class="secundario" id="nf-voltar">← Voltar às contas</button>`
          : `<span>${IC} <b>${ls.length + aj.length} a lançar no IGC</b> · ${ls.length} NFS-e recebidas (bruto <b>${fmt(somaB(ls))}</b>, ${ls.filter(n => !contaDe(n)).length} sem conta de fornecedor) · ${aj.length} ajustes de centavos (total <b>${fmt(somaAj(aj))}</b>)</span><button id="nf-abrir">Ver tudo ▸</button>`;
      }
      app.style.display = aberta ? 'none' : ''; tela.style.display = aberta ? '' : 'none';
      if (aberta) tela.innerHTML = painelNotas(N5 ? 'A lançar no IGC: NFS-e recebidas sem lançamento' : 'NFS-e recebidas sem lançamento no razão', ls);
      const a = $('nf-abrir'), v = $('nf-voltar');
      if (a) a.onclick = () => { aberta = true; desenhar(); };
      if (v) v.onclick = () => { aberta = false; desenhar(); };
    }
    hooks.push(desenhar); faixaFn = desenhar; abrirTelaFn = () => { aberta = true; desenhar(); };
    window.addEventListener('nf-irconta', e => {   // da tela própria direto para a conta
      aberta = false; desenhar();
      const c = D.contas.find(z => z.red === e.detail); if (c) abrir(c);
    });
    desenhar();
  }

  // ================= desenho 3: dentro da conta do fornecedor + item "sem conta" na lista
  function modoContextual() {
    const conteudo = document.querySelector('.principal .conteudo');
    const painel = document.createElement('div'); painel.id = 'nf-painel'; painel.style.display = 'none'; conteudo.appendChild(painel);
    let semConta = false;
    const doConta = c => pend().filter(n => { const k = contaDe(n); return k && k.red === c.red; });
    const orfas = () => pend().filter(n => !contaDe(n));
    const ajDaContaX = c => ajGlobais().filter(a => a.c === c);
    window.PEND_EXTRA = c => doConta(c).length + (N5 ? ajDaContaX(c).length : 0);   // conta só com NFS-e ou ajuste a lançar não some da lista
    const filhos = () => [...conteudo.children].filter(x => x !== painel);
    const _listar = listar, _render = render, _abrir = abrir;

    listar = function () {
      _listar();
      const itens = $('lista').querySelectorAll('.item');
      const ag = N5 ? ajGlobais() : [];
      itens.forEach(el => {
        const c = D.contas[el.dataset.i], k = doConta(c).length, k2 = k + ag.filter(a => a.c === c).length;
        if (k2) el.querySelector('.sub:last-child').insertAdjacentHTML('beforeend', `<span class="tag nfse">${IC} ${N5 ? k2 + ' a lançar' : k + ' NFS-e a lançar'}</span>`);
      });
      const o = orfas().length;
      if (o) {
        $('lista').insertAdjacentHTML('afterbegin', `<div class="item ${semConta ? 'atual' : ''}" id="item-orfas"><div class="nome">${IC} NFS-e sem conta de fornecedor</div>
          <div class="sub"><span>fornecedor ainda não cadastrado no plano</span></div><div class="sub" style="justify-content:flex-start"><span class="tag aberto">${o} notas</span></div></div>`);
        // V1: o item leva para a mesma tela de "Ver o que falta lançar" (uma lista só, sem conta no topo)
        $('item-orfas').onclick = () => { if (V1 && abrirTelaFn) return abrirTelaFn(); semConta = true; mostrarOrfas(); listar(); };
      }
    };
    let n5Aberto = false;
    abrir = function (c) { n5Aberto = false; semConta = false; painel.style.display = 'none'; filhos().forEach(x => x.style.display = ''); _abrir(c); };
    function mostrarOrfas() {
      filhos().forEach(x => x.style.display = 'none'); $('barra').style.display = 'none';
      painel.style.display = ''; painel.innerHTML = painelNotas('NFS-e sem conta de fornecedor no plano', orfas());
    }
    render = function () {
      _render();
      if (V1 && faixaFn) faixaFn();
      const c = atual, ls = doConta(c), ajs = N5 ? ajDaContaX(c) : [];
      if (!ls.length && !ajs.length) return;
      const secoes = $('tab').querySelectorAll('tr.secao');
      const alvo = secoes[1] || null;
      const linhas = `<tr class="secao"><td colspan="4">${IC} ${N5 ? 'A lançar no IGC (' + (ls.length + ajs.length) + ')' : 'NFS-e recebidas sem lançamento (' + ls.length + ')'} <span class="tag nfse">fora dos saldos: ainda não existe no IGC</span></td>
        <td class="n tot"></td><td class="n tot">${fmt(somaB(ls))}</td><td class="n dif neg">${fmt(-somaB(ls))}</td><td></td></tr>` +
        ls.map(n => `<tr class="fantasma"><td></td><td>${dataBR(n.data)}</td>
          <td class="hist"><span class="tag nfse">a lançar</span> NFS-e ${esc(n.numero)} - ${esc(n.prestador)} <span class="muted">(pagamento esperado ${fmt(n.liq)})</span></td>
          <td class="muted">(definir ao lançar)</td><td class="n"></td><td class="n">${fmt(n.bruto)}</td><td class="n dif neg">${fmt(-n.bruto)}</td>
          <td style="text-align:right;white-space:nowrap">${botoes(n, false)}</td></tr>`).join('') + (!ajs.length ? '' :
        `<tr class="fantasma" data-n5="resumo" style="cursor:pointer"><td></td><td colspan="3"><span class="seta ${n5Aberto ? 'aberta' : ''}">▸</span> <span class="tag nfse">a lançar</span> <b>${ajs.length} ajustes de centavos</b> <span class="muted">· total ${fmt(somaAj(ajs))} · vão no CSV para o IGC</span></td><td class="n"></td><td class="n"></td><td class="n dif"></td><td></td></tr>` +
        (n5Aberto ? ajs.map(a => `<tr class="fantasma"><td></td><td>${esc(a.a.data.slice(0, 6) + a.a.data.slice(8))}</td><td class="hist" style="padding-left:30px">Ajuste · ${esc(a.x.nome)} <span class="muted">· ${esc(a.a.compl)} · hist. ${esc(a.a.hist)}</span></td><td><b>${esc(a.a.conta.replace('-', ''))}</b></td><td class="n"></td><td class="n"></td><td class="n dif">${fmt(-a.x.soma)}</td><td style="text-align:right"><button class="${V1 ? 'btn-txt' : 'btn-icone'}" data-n5aj="${a.x.g}" title="Mudar conta, histórico, complemento ou data">${V1 ? 'Editar ajuste' : IC}</button></td></tr>`).join('') : ''));
      if (alvo) alvo.insertAdjacentHTML('beforebegin', linhas); else $('tab').insertAdjacentHTML('beforeend', linhas);
      $('tab').querySelectorAll('[data-n5="resumo"]').forEach(tr => tr.onclick = () => { n5Aberto = !n5Aberto; render(); });
      $('tab').querySelectorAll('[data-n5aj]').forEach(b => b.onclick = e => { e.stopPropagation(); const x = grupos(atual).find(y => y.g === +b.dataset.n5aj); if (x) window.AJ_HOOK.abrir(atual, x); });
      if (typeof marcarCursor === 'function') marcarCursor();
    };
    hooks.push(() => { if (semConta) mostrarOrfas(); else render(); listar(); });
    listar(); render();
  }

  ({ aba: modoAba, card: modoCard, contextual: modoContextual, combinado: () => { modoCard(); modoContextual(); }, n5: () => { modoCard(); modoContextual(); } }[MODO] || (() => {}))();
})();
