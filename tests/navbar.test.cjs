const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const settle = async () => {
  for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve));
};

async function abrirDashboard(relacoes) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, 'pages/dashboard.html'), 'utf8'),
    {url: 'http://localhost:5500/pages/dashboard.html'}
  );
  const usuario = {
    id: 1,
    email: 'profissional@example.test',
    tipoUsuario: 'PROFISSIONAL',
    perfil: {nome: 'Profissional Teste'}
  };
  const sessao = {token: 'token-real', usuario};
  dom.window.localStorage.setItem('oficina.sessao', JSON.stringify(sessao));
  const fetch = async url => {
    const rota = new URL(url).pathname;
    return new Response(JSON.stringify(rota === '/usuario/me' ? usuario : relacoes), {status: 200});
  };
  const contexto = vm.createContext({
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    fetch,
    Headers,
    Response,
    FormData,
    Blob,
    AbortController,
    URL,
    TypeError,
    setTimeout,
    clearTimeout,
    console,
    btoa
  });
  dom.window.OFICINA_CONFIG = {apiBase: 'http://localhost:8080', timeoutMs: 5000};
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/utils.js'), 'utf8'), contexto);
  contexto.Oficina = dom.window.Oficina;
  contexto.navegarCom = dom.window.navegarCom;
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/navbar.js'), 'utf8'), contexto);
  await settle();
  return {dom, close: () => dom.window.close()};
}

test('menu de profissionais indica solicitações recebidas pendentes', async t => {
  const recebida = {
    solicitacao: 'PENDENTE',
    usuarioSolicitante: {id: 2},
    usuarioDestinatario: {id: 1}
  };
  const enviada = {
    solicitacao: 'PENDENTE',
    usuarioSolicitante: {id: 1},
    usuarioDestinatario: {id: 3}
  };
  const aceita = {
    solicitacao: 'ACEITA',
    usuarioSolicitante: {id: 4},
    usuarioDestinatario: {id: 1}
  };
  const {dom, close} = await abrirDashboard([recebida, enviada, aceita]);
  t.after(close);
  const botao = dom.window.document.getElementById('btn-profissionais');
  const badge = botao.querySelector('.nav-notificacao');
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, '1');
  assert.match(botao.getAttribute('aria-label'), /1 solicitação pendente/);
});

test('menu de profissionais não mostra marcação sem solicitações recebidas', async t => {
  const {dom, close} = await abrirDashboard([]);
  t.after(close);
  assert.equal(dom.window.document.querySelector('.nav-notificacao').hidden, true);
});
