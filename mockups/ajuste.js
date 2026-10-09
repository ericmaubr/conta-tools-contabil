// Mockup: "Ajuste a lançar no IGC". Sugestão com diferença de centavos nunca fecha sozinha:
// vira uma linha fantasma (fora dos saldos); o analista prepara o lançamento e baixa o CSV no formato de importação do IGC.
(function () {
  const ICON = window.AJ_ICON || '🧾';   // o N5 usa o mesmo ícone de "a lançar no IGC" para NFS-e e ajuste
  const H = window.HIST_PADRAO || [];
  const hDesc = new Map(H.map(([c, d]) => [c, d]));
  const KEY = 'mock-ajuste' + (window.TELA_V1 ? '-v1' : '');   // V1 tem estado próprio, separado do AJ e do N5
  let S = { aj: {}, ult: {} };
  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const gravar = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const cod = red => red.replace('-', '');                       // 106-6 vira 1066 (regra confirmada no CSV da Yucatan)
  const chave = (c, g) => c.red + '|' + g;
  const plano = Object.entries(D.plano).map(([red, [cls, desc]]) => ({ red, cls, desc }));
  const contaPlano = red => plano.find(p => p.red === red);

  const css = document.createElement('style');
  css.textContent = `
    .modal-fundo { position:fixed; inset:0; background:rgba(20,30,45,.45); z-index:200; display:none; align-items:flex-start; justify-content:center; padding-top:7vh; }
    .modal-fundo.aberto { display:flex; }
    .modal { background:#fff; border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,.25); width:min(640px,94vw); max-height:84vh; overflow:auto; padding:16px 20px; }
    .modal h3 { margin:0 0 4px; font-size:15px; color:#1a3c5e; } .modal .sub { color:#888; font-size:12px; margin-bottom:12px; }
    .modal label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#777; margin:10px 0 3px; }
    .modal input[type=text] { width:100%; }
    .modal .linha2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .modal .rodape { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }
    .modal .lanc { background:#f5f8fb; border-radius:6px; padding:8px 10px; font-size:12px; }
    .modal .lanc div { display:flex; justify-content:space-between; gap:10px; padding:2px 0; }
    .modal .aviso { font-size:11px; color:#8a5a00; margin-top:3px; }
    .modal .ok { font-size:11px; color:#2e7d32; margin-top:3px; font-weight:400; }
    #aj-picker .lista-p { max-height:46vh; overflow:auto; border:1px solid #e2e5eb; border-radius:6px; margin-top:8px; }
    #aj-picker .lista-p div { padding:6px 10px; border-bottom:1px solid #f0f2f5; cursor:pointer; display:flex; gap:10px; }
    #aj-picker .lista-p div:hover { background:#eef3f8; } #aj-picker .lista-p small { color:#888; min-width:150px; }
    .btn-icone.aj-ok { background:#e3f2fd; border-color:#5b9bd5; color:#0d47a1; }
    .tag.aj { background:#e3f2fd; color:#0d47a1; border:1px dashed #5b9bd5; }
    tr.fantasma-aj td { background:#f3f9ff; border-top:1px dashed #5b9bd5; border-bottom:1px dashed #5b9bd5; color:#27415c; }
    table.prev { width:100%; font-size:12px; } table.prev td, table.prev th { padding:4px 6px; }
  `;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-fundo" id="aj-modal"><div class="modal" id="aj-corpo"></div></div>
    <div class="modal-fundo" id="aj-picker" style="z-index:300"><div class="modal">
      <h3>Escolher conta no plano de contas</h3><div class="sub">Plano da empresa, só contas com código reduzido. Busque por nome, código reduzido ou classificação.</div>
      <input type="text" id="aj-busca" placeholder="🔍 ex.: arredondamento, 121-0, 3.1.1"><div class="lista-p" id="aj-lista-p"></div>
      <div class="rodape"><button class="secundario" id="aj-fecha-picker">Cancelar</button></div></div></div>
    <div class="modal-fundo" id="aj-prev"><div class="modal" style="width:min(900px,96vw)" id="aj-prev-corpo"></div></div>`);
  const exBtn = document.querySelector('.toolbar button[onclick="exportarExcel()"]');   // CSV no topo, à esquerda do Excel
  if (exBtn) exBtn.insertAdjacentHTML('beforebegin', '<button class="verde" id="aj-bandeja"></button>');
  const fechar = id => $(id).classList.remove('aberto');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') ['aj-picker', 'aj-prev', 'aj-modal'].some(id => $(id).classList.contains('aberto') && (fechar(id), true)); });

  const dataCompleta = d => d.slice(0, 6) + (2000 + +d.slice(6));   // data do lançamento mais recente do grupo (dd/mm/aaaa), editável no painel
  const dataFim = ls => ls.map(l => l.data).sort((a, b) => (a.slice(6) + a.slice(3, 5) + a.slice(0, 2)).localeCompare(b.slice(6) + b.slice(3, 5) + b.slice(0, 2))).pop();
  const complementoSug = (c, x) => ('AJ ARRED ' + x.nome.replace('Nota ', 'NF ') + ' ' + c.nome).toUpperCase().slice(0, 30);
  const num = v => String(Math.abs(Math.round(v * 100) / 100)).replace('.', ',');

  // ---- painel de preparo
  let ctx = null;
  const padrao = () => S.ult[D.cnpj_empresa] || null;
  // o grupo de centavos só fecha junto com o ajuste: ao salvar o ajuste, o grupo vira conciliado ('ajuste')
  const conciliar = (c, x) => { x.ls.forEach(l => { l.m = 'ajuste'; }); c.mexida = true; salvar(); };
  const novoAjuste = (c, x, p) => ({ red: c.red, g: x.g, conta: p.conta, hist: p.hist, compl: complementoSug(c, x), data: dataCompleta(dataFim(x.ls)), valor: x.soma, nome: x.nome });
  // ✓ rápido: ajuste com o padrão da empresa. Sem padrão (primeira vez), abre o painel para escolher; o escolhido vira o padrão.
  function rapido(c, x, op) {
    op = op || {};
    const p = padrao();
    if (!p) { if (!op.semAbrir) abrirPainel(c, x); return false; }
    if (!op.semSnap) snap(c, 'aceitar com ajuste ' + x.nome, x.g);
    S.aj[chave(c, x.g)] = novoAjuste(c, x, p); gravar(); conciliar(c, x);
    if (!op.semSnap) { alerta('Conciliado. Ajuste de ' + fmt(x.soma) + ' a lançar no IGC (' + cod(p.conta) + ', hist. ' + p.hist + ').', '', true); listar(); atualizarTudo(); }
    return true;
  }
  function abrirPainel(c, x) {
    const k = chave(c, x.g), a = S.aj[k] || {};
    const ult = S.ult[D.cnpj_empresa] || {};
    ctx = { c, x, k, conta: a.conta || ult.conta || '', hist: a.hist || ult.hist || '' };
    const v = x.soma, deb = v < 0;                                 // grupo com crédito a mais: debita a conta do grupo
    $('aj-corpo').innerHTML = `<h3>Preparar ajuste para importar no IGC</h3>
      <div class="sub">${esc(c.nome)} · ${esc(x.nome)} · diferença do grupo <b>${fmt(v)}</b> (D − C). O lançamento zera a diferença.</div>
      <div class="linha2"><div><label>Data do lançamento</label><input type="text" id="aj-data" value="${esc(a.data || dataCompleta(dataFim(x.ls)))}"></div>
        <div><label>Valor</label><input type="text" value="${num(v)}" disabled></div></div>
      <label>Conta de ajuste (contrapartida)</label>
      <div style="display:flex;gap:8px"><input type="text" id="aj-conta" readonly placeholder="Nenhuma conta escolhida" style="flex:1"><button class="secundario" id="aj-escolher">Escolher no plano…</button></div>
      <div class="aviso" id="aj-conta-av"></div>
      <div class="linha2"><div><label>Código do histórico</label><input type="text" id="aj-hist" list="aj-hist-lista" inputmode="numeric" placeholder="digite o código ou escolha"><datalist id="aj-hist-lista">${H.map(([cd, d]) => `<option value="${cd}" label="${esc(d)}"></option>`).join('')}</datalist><div id="aj-hist-desc"></div></div>
        <div><label>Complemento <span class="muted" id="aj-cont">0/30</span></label><input type="text" id="aj-compl" maxlength="30" value="${esc(a.compl || complementoSug(c, x))}"></div></div>
      <label>Como vai para o arquivo</label><div class="lanc" id="aj-prev-l"></div>
      <div class="rodape">${S.aj[k] ? '<button class="secundario excluir" id="aj-remover" style="color:#c62828;border-color:#c62828;margin-right:auto">Remover ajuste e reabrir a sugestão</button>' : ''}<button class="secundario" id="aj-cancelar">Cancelar</button><button class="verde" id="aj-salvar">${x.m === 'centavos' ? 'Salvar ajuste e conciliar' : 'Salvar ajuste'}</button></div>`;
    $('aj-hist').value = ctx.hist;
    const atualizar = () => {
      const cp = contaPlano(ctx.conta);
      $('aj-conta').value = cp ? `${cp.red} · ${cp.desc} (${cp.cls})` : '';
      $('aj-conta-av').textContent = cp ? '' : (ult.conta ? '' : 'Cada empresa usa uma conta; fica guardada como padrão desta empresa depois da primeira escolha.');
      const h = $('aj-hist').value.trim();
      $('aj-hist-desc').innerHTML = !h ? '' : hDesc.has(h) ? `<div class="ok">${esc(hDesc.get(h))}</div>` : (/^\d+$/.test(h) ? '<div class="aviso">Código fora da lista carregada: será usado como digitado.</div>' : '<div class="aviso">Use só o número do histórico.</div>');
      $('aj-cont').textContent = $('aj-compl').value.length + '/30';
      const gr = `${cod(c.red)} ${c.nome}`, aj = cp ? `${cod(cp.red)} ${cp.desc}` : '(escolher conta de ajuste)';
      $('aj-prev-l').innerHTML = `<div><span>Débito</span><b>${esc(deb ? gr : aj)}</b></div><div><span>Crédito</span><b>${esc(deb ? aj : gr)}</b></div><div><span>Valor</span><b>${num(v)}</b></div><div><span>Cod Histórico</span><b>${esc(h || '(informar)')}</b></div>`;
    };
    $('aj-hist').oninput = $('aj-compl').oninput = atualizar;
    $('aj-escolher').onclick = abrirPicker;
    $('aj-cancelar').onclick = () => fechar('aj-modal');
    if ($('aj-remover')) $('aj-remover').onclick = () => {
      snap(c, 'remover ajuste ' + x.nome, x.g); delete S.aj[k]; gravar();
      x.ls.forEach(l => { l.m = 'centavos'; }); c.mexida = true; salvar();   // sem ajuste, o grupo volta a ser sugestão
      fechar('aj-modal'); alerta('Ajuste removido; o grupo voltou para Sugestões.', 'info', true); listar(); atualizarTudo();
    };
    $('aj-salvar').onclick = () => {
      const h = $('aj-hist').value.trim(), dt = $('aj-data').value.trim();
      if (!ctx.conta) return alerta('Escolha a conta de ajuste.', 'erro');
      if (!/^\d+$/.test(h)) return alerta('Informe o código do histórico (só números).', 'erro');
      if (!/^\d\d\/\d\d\/\d{4}$/.test(dt)) return alerta('Data no formato dd/mm/aaaa.', 'erro');
      const fecha = x.m === 'centavos';
      snap(c, (fecha ? 'aceitar com ajuste ' : 'editar ajuste ') + x.nome, x.g);
      S.aj[k] = { red: c.red, g: x.g, conta: ctx.conta, hist: h, compl: $('aj-compl').value, data: dt, valor: v, nome: x.nome };
      S.ult[D.cnpj_empresa] = { conta: ctx.conta, hist: h }; gravar(); fechar('aj-modal');
      if (fecha) conciliar(c, x);
      alerta(fecha ? 'Conciliado. O ajuste entra no CSV para o IGC.' : 'Ajuste salvo.', '', true); listar(); atualizarTudo();
    };
    ctx.atualizar = atualizar; atualizar();
    $('aj-modal').classList.add('aberto');
  }
  function abrirPicker() {
    const desenhar = () => {
      const t = $('aj-busca').value.trim().toUpperCase();
      const r = plano.filter(p => !t || p.desc.toUpperCase().includes(t) || p.red.includes(t) || p.cls.includes(t)).slice(0, 80);
      $('aj-lista-p').innerHTML = r.map(p => `<div data-red="${p.red}"><small>${p.cls}</small><b style="min-width:54px">${p.red}</b><span>${esc(p.desc)}</span></div>`).join('') || '<div class="muted">Nenhuma conta.</div>';
      $('aj-lista-p').querySelectorAll('div[data-red]').forEach(el => el.onclick = () => { ctx.conta = el.dataset.red; fechar('aj-picker'); ctx.atualizar(); });
    };
    $('aj-busca').value = ''; $('aj-busca').oninput = desenhar; desenhar();
    $('aj-fecha-picker').onclick = () => fechar('aj-picker');
    $('aj-picker').classList.add('aberto'); $('aj-busca').focus();
  }

  // ---- CSV no formato de importação do IGC (modelo: YUCATAN - FOLHA 02 2026.csv)
  const pendentes = () => Object.values(S.aj).filter(a => !a.exportado);   // já baixados no CSV esperam a próxima importação do razão
  const linhasCsv = () => pendentes().map(a => {
    const c = D.contas.find(z => z.red === a.red), deb = a.valor < 0;
    const g = cod(a.red), aj = cod(a.conta);
    return { data: a.data, valor: num(a.valor), deb: deb ? g : aj, cre: deb ? aj : g, hist: a.hist, compl: a.compl, c, a };
  });
  const csvTexto = () => 'Data;Valor;Débito;Crédito;Cod Histórico;Cla Deb;Cla Cre;Obs;C. Custo;Complemento\r\n' +
    linhasCsv().map(l => [l.data, l.valor, l.deb, l.cre, l.hist, '', '', '', '', l.compl].join(';') + '\r\n').join('');
  function baixar() {
    const t = csvTexto(), b = new Uint8Array([...t].map(ch => ch.charCodeAt(0) <= 255 ? ch.charCodeAt(0) : 63));   // Latin-1, como o arquivo do IGC
    const url = URL.createObjectURL(new Blob([b], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'AJUSTES - ' + D.empresa.split(' ').slice(0, 2).join(' ') + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function abrirPrevia() {
    const ls = linhasCsv();
    $('aj-prev-corpo').innerHTML = `<h3>Ajustes a importar no IGC (${ls.length})</h3><div class="sub">É este o conteúdo do arquivo: CSV com ponto e vírgula, texto Latin-1, mesmo formato do arquivo de folha.</div>
      <table class="prev"><tr><th>Data</th><th class="n">Valor</th><th>Débito</th><th>Crédito</th><th>Hist.</th><th>Complemento</th><th></th></tr>` +
      ls.map(l => `<tr><td>${l.data}</td><td class="n">${l.valor}</td><td>${l.deb} <span class="muted">${esc(nomeConta(l.deb))}</span></td><td>${l.cre} <span class="muted">${esc(nomeConta(l.cre))}</span></td><td>${esc(l.hist)}</td><td>${esc(l.compl)}</td>
        <td><button class="btn-icone" data-edita="${esc(chave(l.c, l.a.g))}" title="Editar">✏️</button></td></tr>`).join('') + `</table>
      <div class="rodape"><button class="secundario" id="aj-prev-fecha">Fechar</button><button class="verde" id="aj-baixar">⬇ Baixar CSV</button></div>`;
    $('aj-prev-fecha').onclick = () => fechar('aj-prev');
    $('aj-baixar').onclick = () => {
      baixar(); snap(null, 'baixar CSV com ' + ls.length + ' ajustes', null);
      const hoje = new Date().toLocaleDateString('pt-BR');
      pendentes().forEach(a => { a.exportado = hoje; }); gravar(); fechar('aj-prev');
      alerta('CSV baixado com ' + ls.length + ' ajustes. Importe no IGC; eles somem daqui quando o razão novo trouxer os lançamentos.', '', true);
      listar(); atualizarTudo();
    };
    $('aj-prev-corpo').querySelectorAll('[data-edita]').forEach(b => b.onclick = () => {
      const a = S.aj[b.dataset.edita], c = D.contas.find(z => z.red === a.red), x = grupos(c).find(y => y.g === a.g);
      fechar('aj-prev'); if (x) abrirPainel(c, x);
    });
    $('aj-prev').classList.add('aberto');
  }
  const nomeConta = codigo => { const p = plano.find(q => cod(q.red) === codigo); return p ? p.desc : ''; };
  function bandeja() {
    const n = pendentes().length, b = $('aj-bandeja');
    if (!b) return;
    b.disabled = !n; b.textContent = `⬇ CSV para o IGC (${n})`; b.onclick = abrirPrevia;
    b.title = n ? 'Ver os ' + n + (n === 1 ? ' ajuste' : ' ajustes') + ' e baixar o CSV de importação do IGC' : 'Prepare ajustes (' + ICON + ' na linha do grupo) para gerar o arquivo';
  }

  // ---- decoração da grid (grupos com diferença de centavos)
  const _render = render, _listar = listar;
  render = function () {
    _render();
    const c = atual;
    const gs = grupos(c).filter(x => (x.m === 'centavos' || x.m === 'ajuste') && Math.abs(x.soma) > 0.004);
    gs.forEach(x => {
      const tr = $('tab').querySelector(`tr.grp[data-g="${x.g}"]`); if (!tr) return;
      const a = S.aj[chave(c, x.g)];
      if (x.m === 'centavos') {   // sugestão: ✓ rápido (padrão da empresa) ou Ajustar… (escolhe conta, histórico, data)
        const b = tr.querySelector('[data-aceitar]');
        if (b) b.outerHTML = `<button class="btn-txt" data-ajc="${x.g}" title="Escolher conta, histórico, complemento ou data do ajuste antes de conciliar">Ajustar…</button> <button class="btn-txt ok" data-ajr="${x.g}" data-primario title="Concilia e cria o ajuste com o padrão da empresa (Enter)">✓ Aceitar com ajuste</button>`;
        return;
      }
      tr.querySelector('td:nth-child(2)').insertAdjacentHTML('beforeend', a && a.exportado ? ` <span class="tag aj">ajuste no CSV de ${esc(a.exportado.slice(0, 5))}</span>` : ' <span class="tag aj">ajuste a lançar</span>');
      let ultimo = tr; while (ultimo.nextElementSibling && !ultimo.nextElementSibling.matches('tr.grp, tr.secao, tr.total')) ultimo = ultimo.nextElementSibling;
      if (ultimo === tr || !a) return;                                   // grupo recolhido: a linha só aparece ao expandir
      const cp = contaPlano(a.conta), v = -x.soma;                       // lançamento que zera o grupo
      ultimo.insertAdjacentHTML('afterend', `<tr class="fantasma-aj"><td></td><td>${a.data.slice(0, 6) + a.data.slice(8)}</td>
        <td class="hist"><span class="tag aj">${a.exportado ? 'no CSV, aguardando o IGC' : 'ajuste a lançar no IGC'}</span> ${esc(a.compl)} <span class="muted">· hist. ${esc(a.hist)}</span></td>
        <td>${cp ? `<b>${cod(cp.red)}</b> <span class="muted">${esc(cp.desc)}</span>` : ''}</td>
        <td class="n">${v > 0 ? num(v) : ''}</td><td class="n">${v < 0 ? num(v) : ''}</td><td class="n dif">${fmt(v)}</td>
        <td style="text-align:right">${a.exportado ? '' : `<button class="btn-txt" data-aj="${x.g}" title="Mudar conta, histórico, complemento ou data">Editar ajuste</button>`}</td></tr>`);
    });
    const gx = b => grupos(c).find(y => y.g === +b);
    $('tab').querySelectorAll('[data-aj]').forEach(b => b.onclick = e => { e.stopPropagation(); abrirPainel(c, gx(b.dataset.aj)); });
    $('tab').querySelectorAll('[data-ajc]').forEach(b => b.onclick = e => { e.stopPropagation(); abrirPainel(c, gx(b.dataset.ajc)); });
    $('tab').querySelectorAll('[data-ajr]').forEach(b => b.onclick = e => { e.stopPropagation(); rapido(c, gx(b.dataset.ajr)); });
    // padrão da empresa visível: é o que o ✓ rápido grava no CSV
    if (gs.length) {
      const p = padrao(), cp = p && contaPlano(p.conta);
      $('cab').insertAdjacentHTML('beforeend', `<div class="muted" style="margin-top:6px;font-size:12px">${cp
        ? `Ajustes de centavos desta empresa vão para <b>${esc(cp.red)} ${esc(cp.desc)}</b> · histórico <b>${esc(p.hist)}</b> <span>(muda quando você usa "Ajustar…")</span>`
        : 'Conta de ajuste da empresa ainda não definida: o primeiro "Aceitar com ajuste" pede para escolher, e ela vira o padrão.'}</div>`);
    }
    if (typeof marcarCursor === 'function') marcarCursor();
  };
  const atualizarTudo = () => { render(); bandeja(); };
  EXTRAS.push({ get: () => JSON.stringify(S.aj), set: s => { S.aj = JSON.parse(s); gravar(); }, refresh: () => { render(); bandeja(); } });
  window.AJ_HOOK = {
    abrir: abrirPainel, rapido, tem: (c, g) => !!S.aj[chave(c, g)],
    remover: (c, g) => { if (S.aj[chave(c, g)]) { delete S.aj[chave(c, g)]; gravar(); bandeja(); } },
    // o que falta lançar: ajustes salvos e ainda não baixados no CSV
    lista: () => pendentes().map(a => ({ c: D.contas.find(z => z.red === a.red), x: { g: a.g, nome: a.nome, soma: a.valor }, a })).filter(z => z.c),
  };
  render(); bandeja();
})();
