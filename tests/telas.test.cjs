const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
const usuario={id:1,email:'profissional@example.test',tipoUsuario:'PROFISSIONAL',perfil:{id:1,nome:'Profissional Teste',cpf:'52998224725',telefone:'11900001234',dataNascimento:'1995-06-15',conteudoHtml:'<p>Apresentação</p>'}};
const paciente={id:5,email:'paciente@example.test',criadoPorId:1,acessoHabilitado:false,perfil:{id:5,nome:'Paciente Teste',telefone:'11911112222',dataNascimento:'2015-01-02',condicoes:'Condição de teste',conteudoHtml:'<p>Descrição</p>'}};
const rascunhoAluno={nome:paciente.perfil.nome,email:paciente.email,celular:paciente.perfil.telefone,dataNascimento:paciente.perfil.dataNascimento,condicoes:paciente.perfil.condicoes,problemas:'Descrição <teste> do aluno'};
async function pagina(arquivo,script,handler,{query='',hash='',rascunho=null,usuarioSessao=usuario}={}){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'pages',arquivo),'utf8'),{url:`http://localhost:5500/pages/${arquivo}${query}${hash}`});
  const localStorage=dom.window.localStorage,sessionStorage=dom.window.sessionStorage;
  if(rascunho)sessionStorage.setItem('oficina.paciente',JSON.stringify(rascunho));
  localStorage.setItem('oficina.sessao',JSON.stringify({token:'token-real',usuario:usuarioSessao}));
  const chamadas=[];const state={prints:0,copiado:'',autenticado:null};
  const location={href:`http://localhost:5500/pages/${arquivo}${query}${hash}`,pathname:`/pages/${arquivo}`,search:query,hash,replace(url){this.href=url;}};
  const window={location,addEventListener:dom.window.addEventListener.bind(dom.window),OFICINA_CONFIG:{apiBase:'http://localhost:8080',timeoutMs:5000},print(){state.prints++;}};
  const fetch=async(url,op)=>{
    if(String(url).startsWith('data:'))return globalThis.fetch(url);
    const rota=new URL(url).pathname+new URL(url).search;
    let body=op.body;
    if(typeof body==='string')body=JSON.parse(body);
    chamadas.push({rota,method:op.method,body,token:op.headers.get('Authorization')});
    if(rota==='/usuario/me')return new Response(JSON.stringify(usuarioSessao));
    const r=await handler({rota,method:op.method,body});
    return r instanceof Response?r:new Response(JSON.stringify(r??{}));
  };
  const URLTeste=class extends URL{};URLTeste.createObjectURL=()=> 'blob:foto';URLTeste.revokeObjectURL=()=>{};
  const context=vm.createContext({window,document:dom.window.document,location,localStorage,sessionStorage,fetch,Headers,Response,FormData,Blob,File,FileReader:dom.window.FileReader,AbortController,URL:URLTeste,URLSearchParams,TextEncoder,TypeError,setTimeout,clearTimeout,Node:dom.window.Node,DOMParser:dom.window.DOMParser,confirm:()=>true,navigator:{clipboard:{async writeText(t){state.copiado=t;}}},history:{replaceState(a,b,url){state.historia=url;}}});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/utils.js'),'utf8'),context);context.Oficina=window.Oficina;
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js',script),'utf8'),context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));await settle();
  const el=id=>dom.window.document.getElementById(id);
  const click=async id=>{el(id).click();await settle();};
  const submit=async id=>{const form=el(id);form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button[type=submit]')}));await settle();};
  return{dom,el,click,submit,chamadas,state,location,localStorage,sessionStorage,close:()=>dom.window.close()};
}
test('paciente mostra equipe, salva descrição e envia convite sem controlar o aceite',async t=>{
  const p=await pagina('paciente.html','paciente-detalhes.js',async({rota,method,body})=>{
    if(rota==='/paciente/5')return paciente;
    if(rota==='/paciente/5/equipe')return method==='GET'?[]:{id:7};
    if(rota.startsWith('/usuario/buscar'))return[{id:3,nome:'Colega',perfil:{nome:'Colega'}}];
    if(rota==='/usuario/descricao?id=5')return{...paciente.perfil,...body};
    throw new Error('Rota inesperada '+rota);
  },{query:'?paciente=5'});t.after(p.close);
  assert.equal(p.el('conteudo-paciente').hidden,false);assert.equal(p.el('paciente-condicao').value,'Condição de teste');assert.equal(p.el('abrir-metas').getAttribute('href'),'metas.html?paciente=5');
  p.el('paciente-descricao').value='Texto <script>seguro como texto</script>';await p.submit('form-paciente');
  const salvar=p.chamadas.find(c=>c.method==='PUT');assert.match(salvar.body.conteudoHtml,/&lt;script&gt;/);assert.equal(salvar.token,'Bearer token-real');
  p.el('buscar-profissional').value='Colega';await p.click('botao-buscar');await p.submit('form-convite');
  const convite=p.chamadas.find(c=>c.method==='POST');assert.equal(convite.rota,'/paciente/5/equipe');assert.deepEqual(convite.body,{idProfissional:3});
});
test('equipe do paciente mostra somente vínculos profissional-paciente associados a ele',async t=>{
  const relacoes=[
    {
      id:20,tipoRelacao:'PROFISSIONAL_PACIENTE',solicitacao:'PENDENTE',
      usuarioSolicitante:{id:5,nome:'Paciente Teste'},
      usuarioDestinatario:{id:3,nome:'Profissional Convidado'}
    },
    {
      id:21,tipoRelacao:'PROFISSIONAL_PROFISSIONAL',solicitacao:'ACEITA',
      usuarioSolicitante:{id:5,nome:'Registro que não é vínculo de paciente'},
      usuarioDestinatario:{id:4,nome:'Outro Profissional'}
    },
    {
      id:22,tipoRelacao:'PROFISSIONAL_PACIENTE',solicitacao:'ACEITA',
      usuarioSolicitante:{id:7,nome:'Outro Paciente'},
      usuarioDestinatario:{id:4,nome:'Outro Profissional'}
    }
  ];
  const p=await pagina('paciente.html','paciente-detalhes.js',async({rota})=>{
    if(rota==='/paciente/5')return paciente;
    if(rota==='/paciente/5/equipe')return relacoes;
    throw new Error('Rota inesperada '+rota);
  },{query:'?paciente=5'});t.after(p.close);
  const itens=[...p.el('paciente-equipe').querySelectorAll('li')];
  assert.equal(itens.length,1);
  assert.match(itens[0].textContent,/Profissional Convidado/);
  assert.doesNotMatch(p.el('paciente-equipe').textContent,/Registro que não é vínculo|Outro Paciente/);
});
test('convite de equipe mostra paciente, foto e nome do profissional convidante',async t=>{
  const relacao={
    id:12,
    tipoRelacao:'PROFISSIONAL_PACIENTE',
    solicitacao:'PENDENTE',
    nomeConvidante:'Profissional Convidante',
    usuarioSolicitante:{id:5,nome:'Paciente do Convite',urlFotoPerfil:'/usuario/foto?id=5'},
    usuarioDestinatario:{id:1,nome:'Profissional Teste'}
  };
  const p=await pagina('Profissionais.html','profissionais.js',async({rota})=>{
    if(rota==='/usuario-aluno')return[relacao];
    if(rota==='/usuario/foto?id=5')return new Response(new Blob(['foto'],{type:'image/png'}));
    throw new Error('Rota inesperada '+rota);
  });t.after(p.close);
  p.dom.window.document.querySelector('[data-aba="pendentes"]').click();await settle();
  const card=p.el('profissionais-lista').querySelector('.cartao-profissional');
  assert.match(card.querySelector('h3').textContent,/Paciente do Convite/);
  assert.equal(card.querySelector('img').alt,'Foto de Paciente do Convite');
  assert.equal(card.querySelector('img').src,'blob:foto');
  assert.match(card.textContent,/Convidado por/);
  assert.match(card.textContent,/Profissional Convidante/);
  assert.match(card.textContent,/Aceitar/);assert.match(card.textContent,/Recusar/);
  assert.ok(p.chamadas.some(c=>c.rota==='/usuario/foto?id=5'));
});
test('convite sem nomeConvidante sinaliza ausência do dado sem inventar um nome',async t=>{
  const relacao={
    id:14,
    tipoRelacao:'PROFISSIONAL_PACIENTE',
    solicitacao:'PENDENTE',
    usuarioSolicitante:{id:5,nome:'Paciente do Convite',urlFotoPerfil:'/usuario/foto?id=5'},
    usuarioDestinatario:{id:1,nome:'Profissional Teste'}
  };
  const p=await pagina('Profissionais.html','profissionais.js',async({rota})=>{
    if(rota==='/usuario-aluno')return[relacao];
    if(rota==='/usuario/foto?id=5')return new Response(new Blob(['foto'],{type:'image/png'}));
    throw new Error('Rota inesperada '+rota);
  });t.after(p.close);
  p.dom.window.document.querySelector('[data-aba="pendentes"]').click();await settle();
  const card=p.el('profissionais-lista').querySelector('.cartao-profissional');
  assert.match(card.textContent,/Convidado por/);
  assert.match(card.textContent,/Não informado pela API/);
  assert.doesNotMatch(card.textContent,/Profissional Teste/);
});
test('vínculo entre profissionais mantém instituição sem dados de convite de paciente',async t=>{
  const relacao={
    id:13,
    tipoRelacao:'PROFISSIONAL_PROFISSIONAL',
    solicitacao:'ACEITA',
    usuarioSolicitante:{id:1,nome:'Profissional Teste'},
    usuarioDestinatario:{id:3,nome:'Colega',instituicao:'Escola Exemplo'}
  };
  const p=await pagina('Profissionais.html','profissionais.js',async({rota})=>{
    if(rota==='/usuario-aluno')return[relacao];
    throw new Error('Rota inesperada '+rota);
  });t.after(p.close);
  const card=p.el('profissionais-lista').querySelector('.cartao-profissional');
  assert.match(card.textContent,/Colega/);
  assert.match(card.textContent,/Instituição/);
  assert.match(card.textContent,/Escola Exemplo/);
  assert.doesNotMatch(card.textContent,/Convidado por/);
});
test('cartão de profissional expande horário e descrição em HTML seguro',async t=>{
  const relacao={
    id:15,
    tipoRelacao:'PROFISSIONAL_PROFISSIONAL',
    solicitacao:'ACEITA',
    usuarioSolicitante:{id:1,nome:'Profissional Teste'},
    usuarioDestinatario:{
      id:3,
      nome:'Colega',
      perfil:{
        nome:'Colega',
        horarioDeEntrada:'08:30',
        horarioDeSaida:'17:00',
        conteudoHtml:'<p>Atendimento <strong>educacional</strong></p><script>inseguro()</script>'
      }
    }
  };
  const p=await pagina('Profissionais.html','profissionais.js',async({rota})=>{
    if(rota==='/usuario-aluno')return[relacao];
    throw new Error('Rota inesperada '+rota);
  });t.after(p.close);
  const card=p.el('profissionais-lista').querySelector('.cartao-profissional');
  const botao=card.querySelector('.btn-secundario');
  const detalhes=card.querySelector('.detalhes-profissional');
  assert.ok(botao);assert.equal(detalhes.hidden,true);
  botao.click();
  assert.equal(detalhes.hidden,false);
  assert.equal(botao.getAttribute('aria-expanded'),'true');
  assert.match(detalhes.textContent,/08:30 – 17:00/);
  assert.match(detalhes.textContent,/Atendimento educacional/);
  assert.equal(detalhes.querySelector('script'),null);
  botao.click();
  assert.equal(detalhes.hidden,true);
  assert.equal(botao.getAttribute('aria-expanded'),'false');
});
test('ativação de paciente coloca o token no fragmento e copia o link por ação do usuário',async t=>{
  const p=await pagina('paciente.html','paciente-detalhes.js',async({rota})=>{
    if(rota==='/paciente/5')return paciente;if(rota==='/paciente/5/equipe')return[];if(rota==='/paciente/5/ativacao')return{token:'token-unico-de-teste'};throw new Error(rota);
  },{query:'?paciente=5'});t.after(p.close);await p.click('gerar-ativacao');
  const link=new URL(p.el('link-ativacao').value);assert.equal(link.pathname,'/pages/ativar.html');assert.equal(link.search,'');assert.match(link.hash,/token=/);
  await p.click('copiar-ativacao');assert.equal(p.state.copiado,link.href);
});
test('ativação valida a confirmação, usa rota pública e guarda somente a sessão devolvida',async t=>{
  const p=await pagina('ativar.html','ativar.js',async({rota,body})=>{
    assert.equal(rota,'/auth/ativar');assert.equal(body.token,'token-unico-de-teste');return{token:'sessao-paciente',usuario:{...paciente,tipoUsuario:'PACIENTE'}};
  },{hash:'#token=token-unico-de-teste'});t.after(p.close);
  p.el('ativacao-senha').value='SenhaPaciente123!';p.el('ativacao-confirmar').value='diferente';await p.submit('form-ativacao');assert.equal(p.chamadas.length,0);
  p.el('ativacao-confirmar').value='SenhaPaciente123!';await p.submit('form-ativacao');assert.equal(p.chamadas[0].token,null);assert.equal(p.state.historia,'/pages/ativar.html');assert.equal(p.location.href,'dashboard.html');
  assert.equal(JSON.parse(p.localStorage.getItem('oficina.sessao')).token,'sessao-paciente');assert.doesNotMatch(p.localStorage.getItem('oficina.sessao'),/SenhaPaciente/);
});
test('perfil troca foto por multipart e alteração de senha encerra a sessão',async t=>{
  const p=await pagina('perfil.html','meu-perfil.js',async({rota,method,body})=>{
    if(rota==='/usuario/foto?id=1'&&method==='POST'){assert.ok(body instanceof FormData);return{urlFotoPerfil:'/usuario/foto?id=1'};}
    if(rota==='/usuario/foto?id=1')return new Response(new Blob(['png'],{type:'image/png'}));
    if(rota==='/usuario/senha')return new Response(null,{status:204});throw new Error(rota);
  });t.after(p.close);assert.equal(p.el('salvar-foto').disabled,false);
  Object.defineProperty(p.el('nova-foto'),'files',{value:[new File(['foto'],'nova.png',{type:'image/png'})]});await p.click('salvar-foto');assert.match(p.el('pagina-erro').textContent,/Foto atualizada/);
  p.el('senha-atual').value='Senha123!';p.el('nova-senha').value=p.el('confirmar-nova-senha').value='NovaSenha123!';await p.submit('form-senha');assert.equal(p.location.href,'login.html?senha=alterada');assert.equal(p.localStorage.getItem('oficina.sessao'),null);
});
test('relatório imprime conteúdo recebido pela sessão e neutraliza títulos e HTML ativo',async t=>{
  const p=await pagina('relatorio.html','relatorio.js',async({rota})=>{
    if(rota==='/paciente/5')return paciente;if(rota==='/meta?idPaciente=5')return[{id:7,titulo:'<img src=x onerror=alert(1)>',area:'Área',concluido:true,conteudoHtml:'<script>erro()</script><p>Descrição</p>'}];
    if(rota==='/postagem?idMeta=7')return[{id:8,titulo:'Evolução',conteudoHtml:'<p>Registro</p><img src=x onerror=alert(1)>',dataCriacao:'2026-10-19T12:00:00Z',autor:{nome:'Equipe'}}];throw new Error(rota);
  },{query:'?paciente=5'});t.after(p.close);assert.equal(p.el('relatorio-conteudo').hidden,false);assert.equal(p.el('relatorio-metas').querySelectorAll('script,img').length,0);assert.match(p.el('relatorio-resumo').textContent,/1 de 1/);
  await p.click('imprimir-relatorio');assert.equal(p.state.prints,1);assert.ok(p.chamadas.every(c=>c.method==='GET'));
});
test('páginas não têm referências locais quebradas',()=>{
  for(const nome of fs.readdirSync(path.join(root,'pages')).filter(n=>n.endsWith('.html'))){
    const dom=new JSDOM(fs.readFileSync(path.join(root,'pages',nome),'utf8'));
    for(const e of dom.window.document.querySelectorAll('[href],[src]')){
      const ref=e.getAttribute('href')||e.getAttribute('src');if(!ref||/^(https?:|mailto:|tel:|#|data:|blob:)/.test(ref))continue;
      assert.ok(fs.existsSync(path.resolve(root,'pages',ref.split(/[?#]/)[0])),nome+': '+ref);
    }dom.window.close();
  }
});

test('cadastro conclui sem convites e abre a lista do profissional autenticado',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async({rota,method,body})=>{
    if(rota.startsWith('/usuario/buscar'))return[usuario];
    if(rota==='/paciente/criar'&&method==='POST'){
      assert.equal(body.email,paciente.email);
      assert.equal(body.perfilUsuario.nome,rascunhoAluno.nome);
      assert.equal(body.perfilUsuario.telefone,rascunhoAluno.celular);
      assert.equal(body.perfilUsuario.dataNascimento,rascunhoAluno.dataNascimento);
      assert.equal(body.perfilUsuario.condicoes,rascunhoAluno.condicoes);
      assert.match(body.perfilUsuario.conteudoHtml,/Descrição &lt;teste&gt; do aluno/);
      assert.deepEqual(body.profissionais,[]);
      return paciente;
    }
    throw new Error('Rota inesperada '+rota);
  },{hash:'#equipe',rascunho:rascunhoAluno});
  t.after(p.close);
  assert.equal(p.el('parte-equipe').hidden,false);
  assert.equal(p.el('resultados-equipe-aluno').querySelectorAll('input').length,0);
  assert.equal(p.el('continuar-aluno').disabled,false);
  await p.click('continuar-aluno');
  assert.equal(p.location.href,'dashboard.html?alunoCriado=5');
  assert.equal(p.sessionStorage.getItem('oficina.paciente'),null);
  const gravacoes=p.chamadas.filter(c=>c.method==='POST');
  assert.equal(gravacoes.length,1);
  assert.equal(gravacoes[0].token,'Bearer token-real');
});

test('cadastro convida somente os outros profissionais selecionados',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async({rota,body})=>{
    if(rota.startsWith('/usuario/buscar'))return[usuario,{id:3,tipoUsuario:'PROFISSIONAL',perfil:{nome:'Colega'}}];
    if(rota==='/paciente/criar'){assert.deepEqual(body.profissionais,[3]);return paciente;}
    throw new Error(rota);
  },{hash:'#equipe',rascunho:rascunhoAluno});
  t.after(p.close);
  p.el('resultados-equipe-aluno').querySelector('input[value="3"]').click();
  await p.click('continuar-aluno');
  assert.equal(p.location.href,'dashboard.html?alunoCriado=5');
  assert.equal(p.chamadas.filter(c=>c.method==='POST').length,1);
});

test('falha ao criar preserva os dados e não indica sucesso',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async({rota})=>{
    if(rota.startsWith('/usuario/buscar'))return[];
    if(rota==='/paciente/criar')return new Response(JSON.stringify({message:'Cadastro indisponível'}),{status:503});
    throw new Error(rota);
  },{hash:'#equipe',rascunho:rascunhoAluno});
  t.after(p.close);await p.click('continuar-aluno');
  assert.match(p.location.href,/criar_paciente.html/);
  assert.ok(p.sessionStorage.getItem('oficina.paciente'));
  assert.equal(p.el('pagina-erro').hidden,false);
  assert.equal(p.el('continuar-aluno').disabled,false);
});

test('lista confirma o aluno retornado pela API e permite abrir seu perfil',async t=>{
  const p=await pagina('dashboard.html','dashboard.js',async({rota})=>{
    if(rota==='/paciente')return[paciente];
    if(rota==='/meta?idPaciente=5')return[];
    throw new Error(rota);
  },{query:'?alunoCriado=5'});
  t.after(p.close);
  assert.equal(p.el('pacientes-lista').querySelectorAll('article').length,1);
  assert.match(p.el('pacientes-lista').textContent,/Paciente Teste/);
  assert.match(p.el('pagina-erro').textContent,/adicionado à sua lista/);
  p.el('pacientes-lista').querySelector('button').click();
  assert.equal(p.location.href,'metas.html?paciente=5');
});

test('aluno continua visível se a consulta das metas falhar',async t=>{
  const p=await pagina('dashboard.html','dashboard.js',async({rota})=>{
    if(rota==='/paciente')return[paciente];
    if(rota==='/meta?idPaciente=5')return new Response('{}',{status:503});
    throw new Error(rota);
  },{query:'?alunoCriado=5'});
  t.after(p.close);
  assert.equal(p.el('pacientes-lista').querySelectorAll('article').length,1);
  assert.match(p.el('pacientes-lista').textContent,/Indisponível/);
  assert.match(p.el('pagina-erro').textContent,/algumas metas/);
});

test('lista vazia não inventa vínculo a partir do endereço e atualiza ao voltar',async t=>{
  let consultas=0;
  const p=await pagina('dashboard.html','dashboard.js',async({rota})=>{
    if(rota==='/paciente')return ++consultas===1?[]:[paciente];
    if(rota==='/meta?idPaciente=5')return[];
    throw new Error(rota);
  },{query:'?alunoCriado=5'});
  t.after(p.close);
  assert.equal(p.el('pacientes-lista').children.length,0);
  assert.doesNotMatch(p.el('pagina-erro').textContent,/adicionado/);
  p.dom.window.dispatchEvent(new p.dom.window.PageTransitionEvent('pageshow',{persisted:true}));
  await settle();
  assert.equal(consultas,2);
  assert.equal(p.el('pacientes-lista').querySelectorAll('article').length,1);
});

test('cadastro do aluno valida cada seção, volta sem perder dados e permanece na mesma página',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async({rota})=>{throw new Error('Rota inesperada '+rota);});t.after(p.close);
  await p.submit('patientForm');assert.equal(p.el('parte-dados-aluno').hidden,false);
  for(const id of ['nome','email','celular','dataNascimento'])p.el(id).value=rascunhoAluno[id];
  await p.submit('patientForm');
  assert.equal(p.el('parte-dados-aluno').hidden,true);assert.equal(p.el('parte-acompanhamento').hidden,false);
  assert.equal(p.el('condicao').disabled,false);
  assert.match(p.location.href,/criar_paciente.html/);
  p.el('condicao').value='   ';p.el('problemas').value='   ';await p.submit('patientForm');
  assert.equal(p.el('parte-acompanhamento').hidden,false);
  p.el('condicao').value='Contexto salvo';p.el('problemas').value='Dificuldades preservadas';
  await p.click('voltar-etapa-aluno');
  assert.equal(p.el('nome').value,rascunhoAluno.nome);assert.equal(p.el('parte-dados-aluno').hidden,false);
  await p.submit('patientForm');assert.equal(p.el('condicao').value,'Contexto salvo');
  assert.equal(p.chamadas.filter(c=>c.method==='POST').length,0);
});

test('cadastro do aluno bloqueia data futura antes de avançar',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async()=>[]);t.after(p.close);
  for(const id of ['nome','email','celular','dataNascimento'])p.el(id).value=rascunhoAluno[id];
  p.el('dataNascimento').value='2999-01-01';await p.submit('patientForm');
  assert.equal(p.el('parte-dados-aluno').hidden,false);
  assert.equal(p.chamadas.filter(c=>c.method==='POST').length,0);
});

test('convites persistem ao voltar e recarregar, inclusive quando a pesquisa muda',async t=>{
  const handler=async({rota})=>{if(rota.startsWith('/usuario/buscar'))return[{id:3,tipoUsuario:'PROFISSIONAL',perfil:{nome:'Colega'}},{id:6,tipoUsuario:'PACIENTE',perfil:{nome:'Aluno'}}];throw new Error(rota);};
  const p=await pagina('criar_paciente.html','paciente.js',handler,{hash:'#equipe',rascunho:rascunhoAluno});t.after(p.close);
  assert.equal(p.el('resultados-equipe-aluno').querySelectorAll('input').length,1);
  p.el('resultados-equipe-aluno').querySelector('input').click();await settle();
  await p.click('voltar-etapa-aluno');assert.equal(p.el('parte-acompanhamento').hidden,false);
  await p.submit('patientForm');assert.equal(p.el('resultados-equipe-aluno').querySelector('input').checked,true);
  const rascunho=JSON.parse(p.sessionStorage.getItem('oficina.paciente'));
  const q=await pagina('criar_paciente.html','paciente.js',handler,{hash:'#equipe',rascunho});t.after(q.close);
  assert.equal(q.el('resultados-equipe-aluno').querySelector('input').checked,true);
  q.el('selecionados-equipe-aluno').querySelector('button').click();await settle();
  assert.equal(q.el('resultados-equipe-aluno').querySelector('input').checked,false);
});

test('duplo envio cria o aluno uma vez e mantém a página bloqueada enquanto aguarda',async t=>{
  let liberar;const espera=new Promise(r=>{liberar=r;});let criacoes=0;
  const p=await pagina('criar_paciente.html','paciente.js',async({rota})=>{
    if(rota.startsWith('/usuario/buscar'))return[];
    if(rota==='/paciente/criar'){criacoes++;await espera;return paciente;}
    throw new Error(rota);
  },{hash:'#equipe',rascunho:rascunhoAluno});t.after(p.close);
  await Promise.all([p.submit('patientForm'),p.submit('patientForm')]);
  assert.equal(criacoes,1);assert.equal(p.el('continuar-aluno').disabled,true);
  assert.equal(p.el('voltar-etapa-aluno').disabled,true);
  liberar();await settle();assert.equal(p.location.href,'dashboard.html?alunoCriado=5');
});

test('falha na foto preserva o aluno salvo e tenta somente o upload novamente',async t=>{
  let uploads=0;
  const p=await pagina('criar_paciente.html','paciente.js',async({rota,body})=>{
    if(rota.startsWith('/usuario/buscar'))return[];
    if(rota==='/paciente/criar')return paciente;
    if(rota==='/usuario/foto?id=5'){
      uploads++;assert.ok(body instanceof FormData);
      return uploads===1?new Response(JSON.stringify({message:'Upload indisponível'}),{status:503}):{urlFotoPerfil:'/usuario/foto?id=5'};
    }
    throw new Error(rota);
  },{hash:'#equipe',rascunho:{...rascunhoAluno,foto:'data:image/png;base64,aW1hZ2Vt',fotoNome:'foto.png'}});t.after(p.close);
  await p.submit('patientForm');assert.equal(uploads,1);
  assert.equal(JSON.parse(p.sessionStorage.getItem('oficina.paciente')).salvoId,5);
  assert.match(p.el('pagina-erro').textContent,/Aluno salvo e vinculado/);
  assert.equal(p.el('voltar-etapa-aluno').hidden,true);
  await p.submit('patientForm');assert.equal(uploads,2);
  assert.equal(p.chamadas.filter(c=>c.rota==='/paciente/criar').length,1);
  assert.equal(p.location.href,'dashboard.html?alunoCriado=5');
});

test('endereço antigo de equipe retoma a terceira seção sem gravar no servidor',async t=>{
  const p=await pagina('adicione_profissional.html','adicionar_profissional.js',async()=>{throw new Error('Não deve consultar API');},{query:'?cadastro=1',rascunho:rascunhoAluno});t.after(p.close);
  assert.equal(p.location.href,'criar_paciente.html#equipe');assert.equal(p.chamadas.length,0);
});

test('conexões profissionais continuam enviando solicitações fora do cadastro de alunos',async t=>{
  const p=await pagina('adicione_profissional.html','adicionar_profissional.js',async({rota,body})=>{
    if(rota.startsWith('/usuario-aluno?'))return[];
    if(rota.startsWith('/usuario/buscar'))return[{id:3,tipoUsuario:'PROFISSIONAL',perfil:{nome:'Colega'}}];
    if(rota==='/usuario-aluno/criar'){assert.deepEqual(body,{usuarioDestinatario:{id:3}});return{id:8};}
    throw new Error(rota);
  });t.after(p.close);
  p.el('profissionais-lista').querySelector('input').click();await p.click('criarBtn');
  assert.equal(p.location.href,'Profissionais.html');
  assert.equal(p.chamadas.filter(c=>c.rota==='/paciente/criar').length,0);
});

test('conta de aluno não pode usar o cadastro de outros alunos',async t=>{
  const p=await pagina('criar_paciente.html','paciente.js',async()=>[],{usuarioSessao:{...paciente,tipoUsuario:'PACIENTE'}});t.after(p.close);
  assert.equal(p.el('continuar-aluno').disabled,true);
  assert.match(p.el('pagina-erro').textContent,/Só profissionais/);
  await p.submit('patientForm');assert.equal(p.chamadas.filter(c=>c.method==='POST').length,0);
});
