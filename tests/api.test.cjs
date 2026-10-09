const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/utils.js'),'utf8');
function ambiente(fetch){
  const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
  const window={OFICINA_CONFIG:{apiBase:'http://localhost:8080',timeoutMs:5000}};
  const location={replace:url=>location.destino=url};const localStorage=storage(),sessionStorage=storage();
  const contexto={window,location,localStorage,sessionStorage,fetch,Headers,Response,FormData,Blob,AbortController,setTimeout,clearTimeout,URL,TypeError};
  vm.runInNewContext(source,contexto);return{api:window.Oficina,location,localStorage,sessionStorage};
}
const login={token:'jwt.real.assinado',id:9,email:'nome@teste.com',tipoUsuario:'PROFISSIONAL',perfil:{nome:'Teste'}};
test('login público e requisições protegidas enviam Bearer; payload usa os campos nativos',async()=>{
  const chamadas=[];const a=ambiente(async(url,op)=>{chamadas.push([url,op]);return new Response(JSON.stringify(url.endsWith('/auth/login')?login:[]),{status:200})});
  await a.api.login(login.email,'Senha123!');await a.api.get('/paciente');
  assert.equal(chamadas[0][1].headers.get('Authorization'),null);assert.equal(chamadas[1][1].headers.get('Authorization'),'Bearer jwt.real.assinado');
  assert.deepEqual(JSON.parse(chamadas[0][1].body),{email:login.email,senha:'Senha123!'});
});
test('resposta sem token não cria uma sessão falsa',async()=>{
  const a=ambiente(async()=>new Response(JSON.stringify({id:9,email:login.email}),{status:200}));
  await assert.rejects(a.api.login(login.email,'x'),/sessão válida/);assert.equal(a.localStorage.getItem('oficina.sessao'),null);
});
test('erros textuais e JSON são lidos uma vez e preservam mensagens',async()=>{
  let estado=0;const a=ambiente(async()=>estado===0?new Response(JSON.stringify(login),{status:200}):estado===1?new Response('E-mail duplicado.',{status:409}):new Response('{"message":"Paciente não autorizado."}',{status:403}));
  await a.api.login(login.email,'x');estado=1;await assert.rejects(a.api.post('/usuario/criar',{}),/E-mail duplicado/);
  estado=2;await assert.rejects(a.api.get('/paciente/12'),/Paciente não autorizado/);assert.ok(a.api.usuario());
});
test('401 limpa sessão e rascunho de paciente e leva ao login',async()=>{
  let logado=false;const a=ambiente(async()=>logado?new Response('{"message":"Sessão expirada."}',{status:401}):new Response(JSON.stringify(login),{status:200}));
  await a.api.login(login.email,'x');a.sessionStorage.setItem('oficina.paciente','{"nome":"Teste"}');logado=true;
  await assert.rejects(a.api.get('/usuario/me'),/expirada/);assert.equal(a.location.destino,'login.html');assert.equal(a.localStorage.getItem('oficina.sessao'),null);assert.equal(a.sessionStorage.getItem('oficina.paciente'),null);
});
test('multipart usa o boundary do navegador e não um Content-Type JSON',async()=>{
  const chamadas=[];const a=ambiente(async(url,op)=>{chamadas.push(op);return new Response(JSON.stringify(login),{status:200})});
  await a.api.login(login.email,'x');const form=new FormData();form.append('arquivo',new Blob(['conteúdo']),'exercicio.txt');await a.api.post('/anexo/criar?idPostagem=1',form);
  assert.equal(chamadas[1].headers.get('Content-Type'),null);assert.equal(chamadas[1].body,form);assert.equal(chamadas[1].headers.get('Authorization'),'Bearer jwt.real.assinado');
});
test('falha de rede retorna mensagem compreensível',async()=>{
  const a=ambiente(async()=>{throw new TypeError('Failed to fetch')});await assert.rejects(a.api.login(login.email,'x'),/conectar ao servidor/);
});
