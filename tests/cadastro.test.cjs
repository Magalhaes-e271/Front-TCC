const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {readDocument} = require('./helpers/dom.cjs');
const raiz = path.join(__dirname, '..');
const pessoal = {nome: 'Ana Pessoa Teste', email: 'ANA@TESTE.COM', celular: '11900001234', cpf: '52998224725', dataNascimento: '1995-06-15', senha: 'Senha123!', 'confirm-senha': 'Senha123!'};
const profissional = {ocupacao: 'Psicopedagoga', instituicao: 'Oficina', horarioTrabalho: '08:30', formacao: 'Pedagogia'};
const perfil = {...profissional, nome: pessoal.nome, cpf: pessoal.cpf, telefone: pessoal.celular, dataNascimento: pessoal.dataNascimento, conteudoHtml: '<p>Biografia preservada</p>'};
const storage = () => { const map = new Map(); return {getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)}; };
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function ambiente({editar = false, falhasLogin = 0, falhasFoto = 0, falhaPerfil = false, falhaCriar = false} = {}) {
  const document = readDocument(path.join(raiz, 'pages/cadastro.html'));
  const state = {perfil: structuredClone(perfil), chamadas: [], cria: 0, login: 0, foto: 0};
  const localStorage = storage(), sessionStorage = storage();
  const location = {search: editar ? '?editar=1' : '', href: 'cadastro.html', replace(url) { this.href = url; }};
  const window = {OFICINA_CONFIG: {apiBase: 'http://localhost:8080', timeoutMs: 5000}, addEventListener() {}};
  if (editar) localStorage.setItem('oficina.sessao', JSON.stringify({token: 'token-real', usuario: {id: 9, email: 'ana@teste.com', perfil: state.perfil}}));
  const fetch = async (url, op) => {
    const route = new URL(url).pathname;
    const body = typeof op.body === 'string' ? JSON.parse(op.body) : op.body;
    state.chamadas.push({route, method: op.method, body, authorization: op.headers.get('Authorization')});
    const response = (value, status = 200) => new Response(JSON.stringify(value), {status});
    if (route === '/usuario/criar') {
      state.cria++;
      if (falhaCriar) return response({message: 'Já existe um usuário com esse e-mail.'}, 409);
      state.perfil = structuredClone(body.perfilUsuario);
      return response({id: 9, email: body.email, perfil: state.perfil}, 201);
    }
    if (route === '/auth/login') {
      state.login++;
      if (state.login <= falhasLogin) return response({message: 'Login indisponível.'}, 503);
      return response({token: 'token-real', id: 9, email: 'ana@teste.com', tipoUsuario: 'PROFISSIONAL', perfil: state.perfil});
    }
    if (route === '/usuario/me') return falhaPerfil ? response({message: 'Perfil indisponível.'}, 503) : response({id: 9, email: 'ana@teste.com', perfil: state.perfil});
    if (route === '/usuario/descricao') { Object.assign(state.perfil, body); return response(state.perfil); }
    if (route === '/usuario/foto') {
      state.foto++;
      if (state.foto <= falhasFoto) return response({message: 'Foto indisponível.'}, 503);
      return response({urlFotoPerfil: '/usuario/foto?id=9'});
    }
    throw new Error('Rota inesperada: ' + route);
  };
  const TestURL = class extends URL {}; TestURL.createObjectURL = () => 'blob:foto-teste'; TestURL.revokeObjectURL = () => {};
  const context = vm.createContext({window, document, location, localStorage, sessionStorage, fetch, Headers, Response, FormData, Blob, AbortController, URL: TestURL, URLSearchParams, TextEncoder, TypeError, setTimeout, clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(raiz, 'assets/js/utils.js'), 'utf8'), context);
  context.Oficina = window.Oficina; context.toggleSenha = window.toggleSenha;
  vm.runInContext(fs.readFileSync(path.join(raiz, 'assets/js/cadastro.js'), 'utf8'), context);
  const el = id => document.getElementById(id);
  const preencher = async valores => { for (const [id, value] of Object.entries(valores)) { el(id).value = value; await el(id).emit('input'); } };
  const submit = async () => { await el('form-cadastro').emit('submit'); await settle(); };
  const revisar = async () => { await preencher(pessoal); await submit(); await preencher(profissional); await submit(); };
  return {document, state, el, location, localStorage, preencher, submit, revisar};
}
test('avanço exige dados válidos; só a etapa atual aparece; voltar preserva os campos sem criar conta', async () => {
  const a = ambiente(); await a.submit();
  assert.equal(a.document.activeElement.id, 'nome'); assert.equal(a.state.cria, 0);
  await a.preencher(pessoal); await a.submit();
  assert.equal(a.el('parte-pessoal').hidden, true); assert.equal(a.el('parte-profissional').hidden, false);
  assert.equal(a.document.querySelectorAll('.ativa').length, 1);
  await a.el('btn-anterior').emit('click');
  assert.equal(a.el('nome').value, pessoal.nome); assert.equal(a.el('cpf').value, '529.982.247-25');
  assert.equal(a.state.chamadas.length, 0);
});
test('CPF, celular, nascimento, e-mail e confirmação de senha inválidos impedem avanço', async () => {
  for (const [id, value] of Object.entries({cpf: '11111111111', celular: '119123', dataNascimento: '2999-01-01', email: 'invalido', 'confirm-senha': 'Outra123!'})) {
    const a = ambiente(); await a.preencher({...pessoal, [id]: value}); await a.submit();
    assert.equal(a.el(id).getAttribute('aria-invalid'), 'true', id);
    assert.equal(a.el('parte-pessoal').hidden, false); assert.equal(a.state.cria, 0);
  }
});
test('senha preenchida sem evento input é validada e respeita o limite UTF-8 do backend', async () => {
  const a = ambiente(); await a.preencher(pessoal);
  a.el('senha').value = a.el('confirm-senha').value = ' Senha123! '; await a.el('toggle-senha').emit('click'); await a.el('toggle-confirm-senha').emit('click'); await a.submit();
  assert.equal(a.el('parte-profissional').hidden, false);
  const b = ambiente(); await b.preencher({...pessoal, senha: 'Á'.repeat(36) + 'Aa1!', 'confirm-senha': 'Á'.repeat(36) + 'Aa1!'}); await b.submit();
  assert.match(b.el('erro-senha').textContent, /72 bytes/); assert.equal(b.state.cria, 0);
});
test('cadastro envia todas as informações juntas, só após revisão confirmada, e autentica em seguida', async () => {
  const a = ambiente(); await a.revisar();
  assert.equal(a.state.cria, 0); await a.submit(); assert.equal(a.state.cria, 0);
  a.el('conferido').checked = true; await a.submit();
  assert.equal(a.state.cria, 1); assert.equal(a.state.login, 1); assert.equal(a.location.href, 'descricao.html');
  const create = a.state.chamadas[0];
  assert.equal(create.authorization, null); assert.equal(create.body.email, 'ana@teste.com');
  assert.equal(create.body.senha, 'Senha123!'); assert.equal(create.body.tipoUsuario, 'PROFISSIONAL');
  assert.deepEqual(create.body.perfilUsuario, {...profissional, nome: pessoal.nome, cpf: pessoal.cpf, telefone: pessoal.celular, dataNascimento: pessoal.dataNascimento});
  assert.equal(a.el('senha').value, ''); assert.doesNotMatch(a.localStorage.getItem('oficina.sessao'), /Senha123!/);
});
test('revisão trata texto como texto e nunca exibe a senha', async () => {
  const a = ambiente(); await a.preencher({...pessoal, nome: '<img src=x onerror=alert(1)>'}); await a.submit(); await a.preencher(profissional); await a.submit();
  assert.equal(a.el('resumo-pessoal').querySelectorAll('img').length, 0);
  assert.equal(a.el('resumo-pessoal').children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.ok(a.el('resumo-pessoal').children.every(child => !child.textContent.includes(pessoal.senha)));
});
test('falha de login após criação permite tentar entrar sem criar uma segunda conta', async () => {
  const a = ambiente({falhasLogin: 1}); await a.revisar(); a.el('conferido').checked = true; await a.submit();
  assert.match(a.el('pagina-erro').textContent, /já foram criados/); assert.equal(a.state.cria, 1);
  assert.equal(a.el('btn-cadastrar').textContent, 'Tentar entrar'); await a.submit();
  assert.equal(a.state.cria, 1); assert.equal(a.state.login, 2); assert.equal(a.location.href, 'descricao.html');
});
test('foto usa multipart autenticado; falha permite repetir só o upload', async () => {
  const a = ambiente({falhasFoto: 1}); await a.preencher(pessoal); await a.submit(); await a.preencher(profissional);
  a.el('foto').files = [new File(['png'], 'avatar.png', {type: 'image/png'})]; await a.el('foto').emit('change'); await a.submit();
  a.el('conferido').checked = true; await a.submit();
  assert.equal(a.state.foto, 1); assert.equal(a.el('concluir-sem-foto').hidden, false);
  await a.submit(); assert.equal(a.state.foto, 2); assert.equal(a.state.cria, 1); assert.equal(a.state.login, 1);
  const upload = a.state.chamadas.find(c => c.route === '/usuario/foto');
  assert.equal(upload.authorization, 'Bearer token-real'); assert.ok(upload.body instanceof FormData);
  assert.equal(upload.body.get('arquivo').name, 'avatar.png');
});
test('foto inválida impede envio e pode ser removida; falha de upload também permite concluir sem foto', async () => {
  const a = ambiente(); await a.preencher(pessoal); await a.submit(); await a.preencher(profissional);
  a.el('foto').files = [new File(['svg'], 'avatar.svg', {type: 'image/svg+xml'})]; await a.el('foto').emit('change'); await a.submit();
  assert.match(a.el('erro-foto').textContent, /PNG/); assert.equal(a.el('parte-profissional').hidden, false);
  await a.el('remover-foto').emit('click'); await a.submit(); assert.equal(a.el('parte-revisao').hidden, false);
  const b = ambiente({falhasFoto: 1}); await b.preencher(pessoal); await b.submit(); await b.preencher(profissional);
  b.el('foto').files = [new File(['png'], 'avatar.png', {type: 'image/png'})]; await b.submit(); b.el('conferido').checked = true; await b.submit();
  await b.el('concluir-sem-foto').emit('click'); assert.equal(b.location.href, 'descricao.html'); assert.equal(b.state.cria, 1);
});
test('duplo envio é bloqueado enquanto a requisição está pendente', async () => {
  const a = ambiente(); await a.revisar(); a.el('conferido').checked = true;
  await Promise.all([a.el('form-cadastro').emit('submit'), a.el('form-cadastro').emit('submit')]); await settle();
  assert.equal(a.state.cria, 1); assert.equal(a.state.login, 1);
});
test('edição carrega os dados, oculta senha e atualiza o perfil sem recriar conta ou apagar biografia', async () => {
  const a = ambiente({editar: true}); await settle();
  assert.equal(a.el('nome').value, pessoal.nome); assert.equal(a.el('email').readOnly, true); assert.equal(a.el('senha').disabled, true);
  assert.ok(a.document.querySelectorAll('.acesso').every(node => node.hidden));
  await a.preencher({nome: 'Nome atualizado'}); await a.submit(); await a.submit(); a.el('conferido').checked = true; await a.submit();
  assert.equal(a.state.cria, 0); assert.equal(a.state.login, 0); assert.equal(a.state.perfil.nome, 'Nome atualizado');
  assert.equal(a.state.perfil.conteudoHtml, perfil.conteudoHtml); assert.equal(a.location.href, 'descricao.html?editar=1');
  assert.equal(a.state.chamadas.find(c => c.method === 'PUT').authorization, 'Bearer token-real');
});
test('falha ao carregar perfil impede salvar um formulário vazio', async () => {
  const a = ambiente({editar: true, falhaPerfil: true}); await settle(); await a.submit();
  assert.equal(a.el('btn-cadastrar').disabled, true); assert.match(a.el('pagina-erro').textContent, /Recarregue/);
  assert.equal(a.state.chamadas.filter(c => c.method === 'PUT').length, 0);
});
test('erro de cadastro não autentica nem avança e apresenta a mensagem do servidor', async () => {
  const a = ambiente({falhaCriar: true}); await a.revisar(); a.el('conferido').checked = true; await a.submit();
  assert.equal(a.state.login, 0); assert.equal(a.location.href, 'cadastro.html'); assert.match(a.el('pagina-erro').textContent, /Já existe/);
});
test('links antigos de informações e configurações apontam para o cadastro em modo de edição', () => {
  const source = fs.readFileSync(path.join(raiz, 'assets/js/informacoes.js'), 'utf8');
  const location = {replace(url) { this.href = url; }}; vm.runInNewContext(source, {location});
  assert.equal(location.href, 'cadastro.html?editar=1');
  assert.match(fs.readFileSync(path.join(raiz, 'assets/js/navbar.js'), 'utf8'), /'btn-user-config': 'cadastro.html\?editar=1'/);
});
