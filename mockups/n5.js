// N5: Sugestões e Conciliados nascem recolhidos (cada um com o total no cabeçalho); clicar no cabeçalho abre.
(function () {
  // V1: Sugestões é trabalho a fazer, então nasce aberta; só Conciliados nasce recolhido
  const inicio = window.TELA_V1 ? ['ok'] : ['sug', 'ok'];
  const fechadas = new Set(inicio);
  const _render = render, _abrir = abrir;
  abrir = function (c) { fechadas.clear(); inicio.forEach(k => fechadas.add(k)); _abrir(c); };
  render = function () {
    _render();
    $('tab').querySelectorAll('tr.secao').forEach(tr => {
      const txt = tr.textContent;
      const chave = /Sugest/i.test(txt) ? 'sug' : /Conciliados/i.test(txt) ? 'ok' : null;
      if (!chave) return;
      const fechada = fechadas.has(chave);
      tr.firstElementChild.insertAdjacentHTML('afterbegin', `<span class="seta ${fechada ? '' : 'aberta'}">▸</span> `);
      tr.style.cursor = 'pointer';
      tr.title = fechada ? 'Clique para abrir' : 'Clique para recolher';
      tr.onclick = e => { if (e.target.closest('button')) return; fechada ? fechadas.delete(chave) : fechadas.add(chave); render(); };
      if (fechada) { let n = tr.nextElementSibling; while (n && !n.matches('tr.secao, tr.total')) { const prox = n.nextElementSibling; n.style.display = 'none'; n = prox; } }
    });
    if (typeof marcarCursor === 'function') marcarCursor();   // cursor do teclado só anda pelas linhas visíveis
  };
  const exp = $('abrir-todos'), antigo = exp.onclick;   // "Expandir conciliados" também abre as seções
  exp.onclick = () => { fechadas.clear(); antigo(); };
  render();
})();
