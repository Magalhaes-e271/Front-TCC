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
  if(script==='metas.js')vm.runInContext(fs.readFileSync(path.join(root,'assets/js/grafo-metas.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js',script),'utf8'),context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));await settle();
  const el=id=>dom.window.document.getElementById(id);
  const click=async id=>{el(id).click();await settle();};
  const submit=async id=>{const form=el(id);form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button[type=submit]')}));await settle();};
  return{dom,el,click,submit,chamadas,state,location,localStorage,sessionStorage,close:()=>dom.window.close()};
}
const metasTeste=[
 {id:7,titulo:'Reconhecer palavras',area:'Leitura',conteudoHtml:'<p>Identificar palavras.</p><script>perigo()</script>',concluido:false,anteriores:[],responsavel:{nome:'Profissional Teste'}},
 {id:9,titulo:'Construir uma frase',area:'Escrita',conteudoHtml:'<p>Organizar palavras.</p>',concluido:true,anteriores:[7]},
 {id:11,titulo:'Ler uma frase',area:'Leitura',conteudoHtml:'<p>Praticar a leitura.</p>',concluido:false,anteriores:[9]}
];
const lerMetas=({rota})=>{if(rota==='/paciente/5')return paciente;if(rota==='/meta?idPaciente=5')return structuredClone(metasTeste);if(rota.startsWith('/postagem?idMeta='))return[];throw new Error(rota);};
test('progresso real e filtro de áreas preservam conexões com ancestrais visíveis',async t=>{
 const p=await pagina('metas.html','metas.js',lerMetas,{query:'?paciente=5'});t.after(p.close);
 assert.equal(p.el('total-metas').textContent,'3');assert.equal(p.el('concluidas-metas').textContent,'1');assert.equal(p.el('andamento-metas').textContent,'2');assert.equal(p.el('progresso-valor').textContent,'33%');
 assert.equal(p.el('metas-linhas').querySelectorAll('.linha-meta').length,2);assert.equal(p.el('metas-canvas').querySelectorAll('script').length,0);
 [...p.el('areas-menu').querySelectorAll('label')].find(e=>e.textContent==='Leitura').querySelector('input').click();await settle();
 assert.equal(p.el('metas-canvas').querySelectorAll('.meta-container').length,2);assert.equal(p.el('metas-linhas').querySelectorAll('.linha-meta').length,1);assert.equal(p.el('total-metas').textContent,'3');
 assert.equal(p.el('dados-paciente').getAttribute('href'),'paciente.html?paciente=5');assert.equal(p.el('relatorio-paciente').getAttribute('href'),'relatorio.html?paciente=5');
});
test('nova meta envia múltiplas anteriores, descrição escapada e vínculos autenticados à API',async t=>{
 const p=await pagina('metas.html','metas.js',async c=>{
  if(c.rota==='/meta/criar?idPaciente=5'){assert.equal(c.method,'POST');assert.deepEqual(c.body.anteriores,[7,9]);assert.match(c.body.conteudoHtml,/&lt;texto&gt;/);return{id:20,...c.body,concluido:false};}return lerMetas(c);
 },{query:'?paciente=5'});t.after(p.close);
 await p.click('abrir-nova-meta');p.el('meta-titulo').value='Nova habilidade';p.el('meta-area').value='Leitura';p.el('meta-descricao').value='Descrição <texto> seguro';p.el('meta-anteriores').querySelector('input[value="7"]').click();p.el('meta-anteriores').querySelector('input[value="9"]').click();
 assert.match(p.el('anteriores-contagem').textContent,/2 metas anteriores/);
 await p.submit('nova-meta-form');assert.ok(p.el('meta-20'));assert.equal(p.el('total-metas').textContent,'4');assert.equal(p.el('nova-meta-area').open,false);assert.match(p.el('pagina-erro').textContent,/salva no servidor/);assert.equal(p.chamadas.find(c=>c.method==='POST').token,'Bearer token-real');assert.equal(p.el('meta-anteriores').querySelectorAll('input:checked').length,0);assert.equal(p.el('metas-linhas').querySelectorAll('.linha-meta').length,4);
});
test('busca de anteriores preserva marcações ocultas e atualização preserva o rascunho',async t=>{
 const p=await pagina('metas.html','metas.js',lerMetas,{query:'?paciente=5'});t.after(p.close);
 await p.click('abrir-nova-meta');p.el('meta-anteriores').querySelector('input[value="7"]').click();
 p.el('busca-anteriores').value='Escrita';p.el('busca-anteriores').dispatchEvent(new p.dom.window.Event('input'));
 assert.equal(p.el('meta-anteriores').querySelector('input[value="7"]').closest('label').hidden,true);
 p.el('meta-anteriores').querySelector('input[value="9"]').click();assert.equal(p.el('meta-anteriores').querySelectorAll('input:checked').length,2);
 await p.click('recarregar');assert.equal(p.el('meta-anteriores').querySelectorAll('input:checked').length,2);
 p.el('busca-anteriores').value='Inexistente';p.el('busca-anteriores').dispatchEvent(new p.dom.window.Event('input'));assert.equal(p.el('anteriores-vazio').hidden,false);assert.match(p.el('anteriores-contagem').textContent,/2 metas/);
 p.el('busca-anteriores').value='';p.el('busca-anteriores').dispatchEvent(new p.dom.window.Event('input'));p.el('meta-anteriores').querySelector('input[value="7"]').click();assert.match(p.el('anteriores-contagem').textContent,/1 meta anterior/);
});
test('falha ao salvar mantém o formulário e não inventa uma meta',async t=>{
 const p=await pagina('metas.html','metas.js',c=>c.rota.startsWith('/meta/criar')?new Response(JSON.stringify({message:'Falha ao salvar.'}),{status:503}):lerMetas(c),{query:'?paciente=5'});t.after(p.close);
 await p.click('abrir-nova-meta');p.el('meta-titulo').value='Tentativa';p.el('meta-area').value='Leitura';p.el('meta-descricao').value='Uma descrição';p.el('meta-anteriores').querySelector('input[value="7"]').click();p.el('meta-anteriores').querySelector('input[value="9"]').click();await p.submit('nova-meta-form');
 assert.equal(p.el('total-metas').textContent,'3');assert.equal(p.el('nova-meta-area').open,true);assert.equal(p.el('meta-titulo').value,'Tentativa');assert.match(p.el('pagina-erro').textContent,/Falha ao salvar/);assert.equal(p.el('meta-anteriores').querySelectorAll('input:checked').length,2);
});
test('conclusão só muda card e progresso após confirmação do servidor',async t=>{
 let tentativas=0;
 const p=await pagina('metas.html','metas.js',c=>{
  if(c.rota==='/meta/7'){assert.equal(c.method,'PATCH');assert.deepEqual(c.body,{concluido:true});return ++tentativas===1?new Response(JSON.stringify({message:'Falha ao concluir.'}),{status:503}):{...metasTeste[0],concluido:true};}return lerMetas(c);
 },{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('btn-concluir');assert.equal(p.el('concluidas-metas').textContent,'1');assert.match(p.el('meta-erro').textContent,/Falha/);
 await p.click('btn-concluir');assert.equal(p.el('concluidas-metas').textContent,'2');assert.equal(p.el('progresso-valor').textContent,'67%');assert.match(p.el('meta-7').textContent,/Concluída/);assert.equal(p.el('btn-concluir').textContent,'Reabrir meta');
});
test('registro envia multipart com anexo e visibilidade e permite responder',async t=>{
 const p=await pagina('metas.html','metas.js',async c=>{
  if(c.rota==='/postagem/publicar?idMeta=7'){
   assert.ok(c.body instanceof FormData);assert.equal(c.body.get('arquivos').name,'atividade.txt');const d=JSON.parse(await c.body.get('dados').text());assert.equal(d.visualizacao,'PROFISSIONAIS');assert.equal(d.respondeA,null);assert.match(d.conteudoHtml,/&lt;registro&gt;/);return{id:30,...d,dataCriacao:'2026-10-20T12:00:00Z',autor:{nome:'Equipe'},anexos:[]};
  }return lerMetas(c);
 },{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('btn-add-postagem');
 p.el('post-titulo').value='Registro de hoje';p.el('post-conteudo').value='Um <registro> do encontro';p.el('post-visibilidade').value='PROFISSIONAIS';p.el('post-tipo').value='EVOLUCAO';
 Object.defineProperty(p.el('input-anexos'),'files',{value:[new File(['atividade'],'atividade.txt',{type:'text/plain'})],configurable:true});p.el('input-anexos').dispatchEvent(new p.dom.window.Event('change'));await settle();await p.submit('form-postagem');
 assert.equal(p.el('overlay-form').hidden,true);assert.equal(p.el('lista-postagens').querySelectorAll('.postagem').length,1);assert.match(p.el('meta-7').textContent,/1 registro/);
 p.el('lista-postagens').querySelector('.btn-responder').click();await settle();assert.equal(p.el('overlay-form').hidden,false);assert.match(p.el('post-titulo').value,/Re: Registro de hoje/);
});
test('aluno não recebe controles profissionais de criação e conclusão',async t=>{
 const p=await pagina('metas.html','metas.js',lerMetas,{query:'?paciente=5',usuarioSessao:{...paciente,tipoUsuario:'PACIENTE'}});t.after(p.close);
 assert.equal(p.el('abrir-nova-meta').hidden,true);assert.equal(p.el('nova-meta-area').hidden,true);assert.equal(p.el('btn-concluir').hidden,true);p.el('meta-7').querySelector('button').click();await settle();await p.click('btn-concluir');assert.equal(p.chamadas.filter(c=>c.method==='PATCH').length,0);
});
test('estado vazio mostra progresso zero e sem ID não consulta o aluno',async t=>{
 const p=await pagina('metas.html','metas.js',c=>c.rota==='/paciente/5'?paciente:[],{query:'?paciente=5'});t.after(p.close);assert.equal(p.el('metas-vazio').hidden,false);assert.equal(p.el('total-metas').textContent,'0');assert.equal(p.el('progresso-valor').textContent,'0%');
 const q=await pagina('metas.html','metas.js',()=>{throw new Error('Sem ID não deve consultar.');});t.after(q.close);assert.match(q.el('pagina-erro').textContent,/pelo painel/);assert.equal(q.chamadas.filter(c=>c.rota!=='/usuario/me').length,0);
});
const colabFixture=()=>metasTeste.map((m,i)=>({...m,concluido:false,versao:0,totalPostagens:0,responsavel:{id:i===1?2:1,nome:i===1?'Colega da equipe':'Profissional Teste'}}));
const leitorColab=(lista,c)=>{if(c.rota==='/paciente/5')return paciente;if(c.rota==='/meta?idPaciente=5')return structuredClone(lista);if(/^\/meta\/\d+$/.test(c.rota))return structuredClone(lista.find(m=>m.id===Number(c.rota.split('/').pop())));if(c.rota.startsWith('/postagem?idMeta='))return[];throw new Error(c.rota);};
test('edição usa versão atual, preserva HTML não alterado e mantém a autoria',async t=>{
 const lista=colabFixture();let corpo;
 const p=await pagina('metas.html','metas.js',c=>{if(c.method==='PATCH'){corpo=c.body;Object.assign(lista[0],c.body,{versao:1,atualizadoPor:{id:2,nome:'Colega da equipe'}});return lista[0];}return leitorColab(lista,c);},{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-editar');p.el('editar-meta-titulo').value='Título colaborativo';await p.submit('form-editar-meta');
 assert.equal(corpo.versao,0);assert.equal(corpo.titulo,'Título colaborativo');assert.equal(corpo.conteudoHtml,undefined);assert.match(p.el('meta-7').textContent,/Título colaborativo/);assert.match(p.el('meta-autoria').textContent,/Profissional Teste.*Colega da equipe/);
});
test('conflito de edição mantém os campos digitados e oferece recarregar sem sobrescrever a meta',async t=>{
 const lista=colabFixture();
 const p=await pagina('metas.html','metas.js',c=>c.method==='PATCH'?new Response(JSON.stringify({message:'Outra pessoa atualizou.'}),{status:409}):leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-editar');p.el('editar-meta-titulo').value='Meu rascunho';await p.submit('form-editar-meta');assert.equal(p.el('editar-meta-titulo').value,'Meu rascunho');assert.equal(p.el('recarregar-edicao-meta').hidden,false);assert.doesNotMatch(p.el('meta-7').textContent,/Meu rascunho/);assert.match(p.el('edicao-meta-erro').textContent,/preservados/);
});
test('gerencia conexões de metas existentes em uma única requisição versionada',async t=>{
 const lista=colabFixture();lista.forEach(m=>m.anteriores=[]);let corpo;
 const p=await pagina('metas.html','metas.js',c=>{if(c.rota==='/meta/7/conexoes'){corpo=c.body;lista[0].anteriores=c.body.anteriores;lista[1].anteriores=[7];lista[2].anteriores=[7];return lista;}return leitorColab(lista,c);},{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-conexoes');await p.click('editar-conexoes');
 p.el('conexoes-seguintes').querySelector('input[value="9"]').click();p.el('conexoes-seguintes').querySelector('input[value="11"]').click();await p.submit('form-conexoes');
 assert.deepEqual(corpo.anteriores,[]);assert.deepEqual(corpo.seguintes,[9,11]);assert.deepEqual(corpo.versoes,{'7':0,'9':0,'11':0});assert.equal(p.el('form-conexoes').hidden,true);assert.equal(p.el('metas-linhas').querySelectorAll('.linha-meta').length,2);assert.match(p.el('conexoes-resumo').textContent,/salvas para a equipe/);
});
test('meta existente recebe duas anteriores e mantém as duas após recarregar',async t=>{
 const lista=colabFixture();lista.forEach(m=>m.anteriores=[]);let corpo;
 const p=await pagina('metas.html','metas.js',c=>{if(c.rota==='/meta/11/conexoes'){corpo=c.body;lista[2].anteriores=c.body.anteriores;return lista;}return leitorColab(lista,c);},{query:'?paciente=5'});t.after(p.close);
 p.el('meta-11').querySelector('button').click();await settle();await p.click('aba-conexoes');await p.click('editar-conexoes');
 p.el('conexoes-anteriores').querySelector('input[value="7"]').click();p.el('conexoes-anteriores').querySelector('input[value="9"]').click();await p.submit('form-conexoes');
 assert.deepEqual(corpo.anteriores,[7,9]);assert.equal(p.el('metas-linhas').querySelectorAll('.linha-meta').length,2);assert.match(p.el('conexoes-resumo').textContent,/Reconhecer palavras/);assert.match(p.el('conexoes-resumo').textContent,/Construir uma frase/);
 await p.click('fechar-meta');await p.click('recarregar');p.el('meta-11').querySelector('button').click();await settle();await p.click('aba-conexoes');await p.click('editar-conexoes');assert.equal(p.el('conexoes-anteriores').querySelectorAll('input:checked').length,2);
});
test('prévia bloqueia ciclo sem enviar uma alteração inválida ao servidor',async t=>{
 const lista=colabFixture();
 const p=await pagina('metas.html','metas.js',c=>leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);
 p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-conexoes');await p.click('editar-conexoes');p.el('conexoes-anteriores').querySelector('input[value="11"]').click();await settle();assert.equal(p.el('salvar-conexoes').disabled,true);assert.match(p.el('conexoes-previa').textContent,/ciclo/);await p.submit('form-conexoes');assert.equal(p.chamadas.filter(c=>c.method==='PATCH').length,0);
});
test('busca, filtro por profissional e lista mostram as metas da equipe sem afetar os totais',async t=>{
 const lista=colabFixture();const p=await pagina('metas.html','metas.js',c=>leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);
 assert.match(p.el('colab-resumo').textContent,/2 profissionais/);p.el('filtro-autor').value='2';p.el('filtro-autor').dispatchEvent(new p.dom.window.Event('change'));await settle();assert.equal(p.el('metas-canvas').querySelectorAll('.meta-container').length,1);assert.ok(p.el('meta-9'));assert.equal(p.el('total-metas').textContent,'3');await p.click('modo-lista');assert.equal(p.el('metas-area').classList.contains('modo-lista'),true);await p.click('limpar-filtros');assert.equal(p.el('metas-canvas').querySelectorAll('.meta-container').length,3);p.el('busca-metas').value='Colega da equipe';p.el('busca-metas').dispatchEvent(new p.dom.window.Event('input'));await settle();assert.equal(p.el('metas-canvas').querySelectorAll('.meta-container').length,1);
});
test('carregamento inicial não baixa todas as postagens; abrir uma meta consulta apenas os seus registros',async t=>{
 const lista=colabFixture();const p=await pagina('metas.html','metas.js',c=>leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);assert.equal(p.chamadas.filter(c=>c.rota.startsWith('/postagem?')).length,0);p.el('meta-9').querySelector('button').click();await settle();assert.deepEqual(p.chamadas.filter(c=>c.rota.startsWith('/postagem?')).map(c=>c.rota),['/postagem?idMeta=9']);
});
test('trocar de aba e voltar para edição mantém o rascunho até cancelar ou recarregar',async t=>{const lista=colabFixture();const p=await pagina('metas.html','metas.js',c=>leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-editar');p.el('editar-meta-titulo').value='Rascunho entre abas';await p.click('aba-conexoes');await p.click('aba-editar');assert.equal(p.el('editar-meta-titulo').value,'Rascunho entre abas');await p.click('recarregar-edicao-meta');assert.equal(p.el('editar-meta-titulo').value,lista[0].titulo);});
test('fechar editor de conexões e abrir outra meta restaura o resumo de conexões',async t=>{const lista=colabFixture();const p=await pagina('metas.html','metas.js',c=>leitorColab(lista,c),{query:'?paciente=5'});t.after(p.close);p.el('meta-7').querySelector('button').click();await settle();await p.click('aba-conexoes');await p.click('editar-conexoes');await p.click('fechar-meta');p.el('meta-9').querySelector('button').click();await settle();await p.click('aba-conexoes');assert.equal(p.el('form-conexoes').hidden,true);assert.equal(p.el('conexoes-resumo').hidden,false);assert.match(p.el('conexoes-resumo').textContent,/Reconhecer palavras/);});
