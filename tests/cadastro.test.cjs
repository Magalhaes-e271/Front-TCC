const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const raiz = path.join(__dirname, '..');
const pessoal = {nome:'Ana Pessoa Teste',email:'ANA@TESTE.COM',celular:'11900001234',cpf:'52998224725',dataNascimento:'1995-06-15',senha:'Senha123!','confirm-senha':'Senha123!'};
const profissional = {ocupacao:'Psicopedagoga',instituicao:'Oficina',horarioTrabalho:'08:30',horarioDeSaida:'17:00',descricao:'Biografia preservada'};
const perfil = {id:9,nome:pessoal.nome,cpf:pessoal.cpf,telefone:pessoal.celular,dataNascimento:pessoal.dataNascimento,ocupacao:profissional.ocupacao,instituicao:profissional.instituicao,horarioDeEntrada:'08:30:00',horarioDeSaida:'17:00:00',conteudoHtml:'<p>Biografia preservada</p>',urlFotoPerfil:'/usuario/foto?id=9'};
const storage = () => {const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}};
const settle = async () => {for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
async function ambiente({editar=false,falhaCriar=false,falhaPerfil=false,respostaSemSessao=false,aguardarCriacao=null}={}) {
  const dom=new JSDOM(fs.readFileSync(path.join(raiz,'pages/cadastro.html'),'utf8'),{url:'http://localhost:5500/pages/cadastro.html'});
  const document=dom.window.document;
  const state={perfil:structuredClone(perfil),chamadas:[],cria:0};
  const localStorage=storage(),sessionStorage=storage();
  const location={search:editar?'?editar=1':'',href:'cadastro.html',replace(url){this.href=url;}};
  const window={OFICINA_CONFIG:{apiBase:'http://localhost:8080',timeoutMs:5000},addEventListener(){}};
  if(editar)localStorage.setItem('oficina.sessao',JSON.stringify({token:'token-real',usuario:{id:9,email:'ana@teste.com',tipoUsuario:'PROFISSIONAL',perfil:state.perfil}}));
  const fetch=async(url,op)=>{
    const route=new URL(url).pathname;
    const body=typeof op.body==='string'?JSON.parse(op.body):op.body;
    state.chamadas.push({route,method:op.method,body,authorization:op.headers.get('Authorization'),contentType:op.headers.get('Content-Type')});
    const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
    if(route==='/usuario/criar'){
      state.cria++;
      if(aguardarCriacao)await aguardarCriacao;
      if(falhaCriar)return response({message:'Já existe um usuário com esse e-mail.'},409);
      assert.ok(body instanceof FormData);
      const dados=JSON.parse(await body.get('dados').text());
      state.perfil={...dados.perfilUsuario,id:9,...(body.get('foto')?{urlFotoPerfil:'/usuario/foto?id=9'}:{})};
      return response(respostaSemSessao?{id:9}:{token:'token-real',usuario:{id:9,email:dados.email,tipoUsuario:'PROFISSIONAL',perfil:state.perfil}},201);
    }
    if(route==='/usuario/email'||route==='/usuario/me')return falhaPerfil?response({message:'Perfil indisponível.'},503):response({id:9,email:'ana@teste.com',tipoUsuario:'PROFISSIONAL',perfil:state.perfil});
    if(route==='/usuario/descricao'){Object.assign(state.perfil,body);return response(state.perfil);}
    if(route==='/usuario/foto')return new Response(new Blob(['foto'],{type:'image/png'}));
    throw new Error('Rota inesperada: '+route);
  };
  const TestURL=class extends URL{};TestURL.createObjectURL=()=> 'blob:foto-teste';TestURL.revokeObjectURL=()=>{};
  const context=vm.createContext({window,document,location,localStorage,sessionStorage,fetch,Headers,Response,FormData,Blob,File,AbortController,URL:TestURL,URLSearchParams,TextEncoder,TypeError,setTimeout,clearTimeout,Node:dom.window.Node,DOMParser:dom.window.DOMParser});
  for(const name of ['utils','cadastro'])vm.runInContext(fs.readFileSync(path.join(raiz,`assets/js/${name}.js`),'utf8'),context);
  document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));await settle();
  const el=id=>document.getElementById(id);
  const emit=async(id,event)=>{el(id).dispatchEvent(new dom.window.Event(event,{bubbles:true,cancelable:true}));await settle();};
  const preencher=async valores=>{for(const[id,value]of Object.entries(valores)){el(id).value=value;await emit(id,'input');}};
  const foto=async(tipo='image/png')=>{Object.defineProperty(el('foto'),'files',{value:[new File(['png'],'avatar.png',{type:tipo})],configurable:true});await emit('foto','change');};
  const submit=()=>emit('form-cadastro','submit');
  const revisar=async()=>{await preencher(pessoal);await submit();await preencher(profissional);if(!editar)await foto();await submit();};
  return{document,state,el,location,localStorage,preencher,submit,revisar,foto,emit,close:()=>dom.window.close()};
}

test('avanço exige dados válidos e preserva os campos sem criar a conta',async t=>{
  const a=await ambiente();t.after(a.close);await a.submit();assert.equal(a.document.activeElement.id,'nome');
  await a.preencher(pessoal);await a.submit();assert.equal(a.el('parte-pessoal').hidden,true);assert.equal(a.el('parte-profissional').hidden,false);
  await a.emit('btn-anterior','click');assert.equal(a.el('nome').value,pessoal.nome);assert.equal(a.state.cria,0);
});
test('CPF, celular, data, e-mail e confirmação inválidos impedem avanço',async t=>{
  for(const[id,value]of Object.entries({cpf:'11111111111',celular:'119123',dataNascimento:'2999-01-01',email:'invalido','confirm-senha':'Outra123!'})){
    const a=await ambiente();t.after(a.close);await a.preencher({...pessoal,[id]:value});await a.submit();assert.equal(a.el(id).getAttribute('aria-invalid'),'true',id);assert.equal(a.state.cria,0);
  }
});
test('senha é validada sem depender de input e respeita 72 bytes UTF-8',async t=>{
  const a=await ambiente();t.after(a.close);await a.preencher(pessoal);a.el('senha').value=a.el('confirm-senha').value=' Senha123! ';await a.submit();assert.equal(a.el('parte-profissional').hidden,false);
  const b=await ambiente();t.after(b.close);await b.preencher({...pessoal,senha:'Á'.repeat(36)+'Aa1!','confirm-senha':'Á'.repeat(36)+'Aa1!'});await b.submit();assert.match(b.el('erro-senha').textContent,/72 bytes/);
});
test('cadastro multipart envia dados e foto juntos e usa a sessão devolvida pela API',async t=>{
  const a=await ambiente();t.after(a.close);await a.revisar();assert.equal(a.el('parte-revisao').hidden,false);await a.submit();assert.equal(a.state.cria,0);
  a.el('conferido').checked=true;await a.submit();assert.equal(a.state.cria,1);assert.equal(a.location.href,'dashboard.html');
  assert.equal(a.state.chamadas.length,1);const c=a.state.chamadas[0];assert.equal(c.authorization,null);assert.equal(c.contentType,null);
  const dados=JSON.parse(await c.body.get('dados').text());assert.equal(dados.email,'ana@teste.com');assert.equal(dados.senha,'Senha123!');
  assert.equal(dados.perfilUsuario.horarioDeEntrada,'08:30:00');assert.equal(dados.perfilUsuario.horarioDeSaida,'17:00:00');assert.equal(c.body.get('foto').name,'avatar.png');
  assert.equal(JSON.parse(a.localStorage.getItem('oficina.sessao')).usuario.id,9);assert.doesNotMatch(a.localStorage.getItem('oficina.sessao'),/Senha123!/);
});
test('somente ocupação é obrigatória no perfil profissional',async t=>{
  const a=await ambiente();t.after(a.close);await a.preencher(pessoal);await a.submit();
  assert.equal(a.el('ocupacao').required,true);
  for(const id of ['instituicao','horarioTrabalho','horarioDeSaida','descricao','foto'])assert.equal(a.el(id).required,false,id);
  await a.submit();assert.match(a.el('erro-ocupacao').textContent,/Preencha/);
  await a.preencher({ocupacao:'Psicopedagoga'});await a.submit();assert.equal(a.el('parte-revisao').hidden,false);
  a.el('conferido').checked=true;await a.submit();assert.equal(a.state.cria,1);
  const chamada=a.state.chamadas[0];assert.equal(chamada.body.get('foto'),null);
  const dados=JSON.parse(await chamada.body.get('dados').text());assert.equal(dados.perfilUsuario.ocupacao,'Psicopedagoga');
  assert.equal(a.location.href,'dashboard.html');
});
test('formatos de foto não aceitos continuam sendo rejeitados',async t=>{
  const a=await ambiente();t.after(a.close);await a.preencher(pessoal);await a.submit();await a.preencher(profissional);await a.foto('image/svg+xml');await a.submit();assert.match(a.el('erro-foto').textContent,/PNG/);assert.equal(a.state.cria,0);
});
test('revisão apresenta texto sem executar HTML e sem mostrar a senha',async t=>{
  const a=await ambiente();t.after(a.close);await a.preencher({...pessoal,nome:'<img src=x onerror=alert(1)>'});await a.submit();await a.preencher(profissional);await a.foto();await a.submit();
  assert.equal(a.el('resumo-pessoal').querySelectorAll('img').length,0);assert.match(a.el('resumo-pessoal').textContent,/<img src=x/);assert.doesNotMatch(a.el('resumo-pessoal').textContent,/Senha123!/);
});
test('duplo envio não duplica o cadastro',async t=>{
  let liberar;const pendente=new Promise(resolve=>{liberar=resolve;});const a=await ambiente({aguardarCriacao:pendente});t.after(a.close);await a.revisar();a.el('conferido').checked=true;
  await Promise.all([a.submit(),a.submit()]);assert.equal(a.state.cria,1);liberar();await settle();assert.equal(a.state.cria,1);
});
test('edição salva horários e descrição sem criar outra conta',async t=>{
  const a=await ambiente({editar:true});t.after(a.close);assert.equal(a.el('nome').value,pessoal.nome);assert.equal(a.el('email').readOnly,true);assert.equal(a.el('senha').disabled,true);
  assert.equal(a.el('cpf').readOnly,true);assert.equal(a.el('instituicao').required,true);assert.equal(a.el('descricao').required,true);assert.equal(a.el('horarioTrabalho').disabled,false);
  a.el('cpf').value='111.444.777-35';await a.preencher({nome:'Nome atualizado'});await a.submit();await a.preencher({horarioTrabalho:'09:00'});await a.submit();a.el('conferido').checked=true;await a.submit();
  assert.equal(a.state.cria,0);assert.equal(a.state.perfil.nome,'Nome atualizado');assert.equal(a.state.perfil.horarioDeEntrada,'09:00:00');assert.equal(a.state.perfil.conteudoHtml,perfil.conteudoHtml);
  assert.equal(a.state.chamadas.find(c=>c.method==='PUT').body.cpf,'52998224725');
  assert.equal(a.state.chamadas.find(c=>c.method==='PUT').authorization,'Bearer token-real');assert.match(a.el('pagina-erro').textContent,/sucesso/);
});
test('falha de carregamento impede sobrescrever perfil com dados vazios',async t=>{
  const a=await ambiente({editar:true,falhaPerfil:true});t.after(a.close);await a.submit();assert.equal(a.el('btn-cadastrar').disabled,true);assert.match(a.el('pagina-erro').textContent,/Recarregue/);assert.equal(a.state.chamadas.filter(c=>c.method==='PUT').length,0);
});
test('erro de cadastro preserva a mensagem do servidor e não inventa uma sessão',async t=>{
  const a=await ambiente({falhaCriar:true});t.after(a.close);await a.revisar();a.el('conferido').checked=true;await a.submit();assert.equal(a.location.href,'cadastro.html');assert.match(a.el('pagina-erro').textContent,/Já existe/);assert.equal(a.localStorage.getItem('oficina.sessao'),null);
});
test('cadastro confirmado com resposta incompleta direciona ao login e impede repetir a criação',async t=>{
  const a=await ambiente({respostaSemSessao:true});t.after(a.close);await a.revisar();a.el('conferido').checked=true;await a.submit();assert.equal(a.state.cria,1);assert.match(a.el('pagina-erro').textContent,/já foi criada/);await a.submit();assert.equal(a.state.cria,1);assert.equal(a.location.href,'login.html?cadastro=sucesso');
});
