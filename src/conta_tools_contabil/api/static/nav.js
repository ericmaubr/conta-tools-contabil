// Fonte única do menu hambúrguer (mesmo padrão do conta-tools-nfts): página nova = editar só este
// arquivo.

// Renova a sessão uma vez antes de desistir: o access token do conta-tools-auth dura 30 min, e sem
// isto a tela quebraria a cada meia hora mesmo com o refresh (cookie de vida longa) válido.
let _renovacaoEmAndamento = null;

async function contaToolsFetch(url, opcoes) {
  const resp = await fetch(url, opcoes);
  if (resp.status !== 401 && resp.status !== 403) return resp;
  if (!_renovacaoEmAndamento) {
    _renovacaoEmAndamento = fetch('/auth/refresh', { method: 'POST' })
      .then(r => r.ok).catch(() => false)
      .finally(() => { _renovacaoEmAndamento = null; });
  }
  const renovou = await _renovacaoEmAndamento;
  if (renovou) return fetch(url, opcoes);
  // Sessão inválida de vez: manda pro login em vez de deixar a tela com dado vazio. Em modo
  // local/dev ([auth] jwt_segredo vazio) o backend nunca devolve 401/403, então isto não dispara.
  window.location.href = '/auth/?next=' + encodeURIComponent(location.pathname + location.search);
  return resp;
}

const _SISTEMA = 'conta-tools-contabil';
let _papeis = null;

function papeisDoUsuario() {
  _papeis = _papeis || fetch('me/papeis')
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}));
  return _papeis;
}

// Item que a pessoa não pode abrir não aparece. Conveniência: a autorização continua no backend.
// `{}` significa "não dá pra filtrar" (modo dev), e aí o menu sai inteiro.
function podeVer(papeis, modulo) {
  return !modulo || !papeis || !Object.keys(papeis).length
    || Boolean(papeis[_SISTEMA + '.' + modulo]);
}

const NAV_ITEMS = [
  { id: 'importacao', href: '.', label: 'Importar do IGC', modulo: 'conciliacao' },
];

async function montarNavLinks(atual) {
  const container = document.querySelector('.nav-links');
  if (!container) return;
  const papeis = await papeisDoUsuario();
  container.innerHTML = NAV_ITEMS.filter(item => podeVer(papeis, item.modulo)).map(item =>
    `<a href="${item.href}"${item.id === atual ? ' class="atual"' : ''}><span class="dot"></span>${item.label}</a>`
  ).join('');
}
