const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const raiz=path.join(__dirname,'..');
const usuario={id:1,email:'profissional@example.test',tipoUsuario:'PROFISSIONAL',perfil:{nome:'Profissional Teste'}};
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
async function pagina(arquivo,scripts,handler,conta=usuario){
 const dom=new JSDOM(fs.readFileSync(path.join(raiz,'pages',arquivo),'utf8'),{url:'http://localhost:5500/pages/'+arquivo});
 const {document,localStorage,sessionStorage}=dom.window;
 if(arquivo!=='login.html')localStorage.setItem('oficina.sessao',JSON.stringify({token:'antes',usuario:conta}));
 const chamadas=[],location={replace(url){this.destino=url;},reload(){}};
 const window={location,OFICINA_CONFIG:{apiBase:'http://localhost:8181',timeoutMs:5000},confirm:()=>true,addEventListener:dom.window.addEventListener.bind(dom.window)};
 const fetch=async(url,op)=>{
  const rota=new URL(url).pathname,body=op.body?JSON.parse(op.body):undefined;
  chamadas.push({rota,body,token:new Headers(op.headers).get('Authorization')});
  const r=rota==='/usuario/me'?conta:await handler(rota,body);
  return r instanceof Response?r:new Response(JSON.stringify(r));
 };
 const URLTeste=class extends URL{};URLTeste.createObjectURL=()=> 'blob:codigos';URLTeste.revokeObjectURL=()=>{};
 const ctx=vm.createContext({window,document,localStorage,sessionStorage,location,fetch,Headers,Response,FormData,Blob,AbortController,URL:URLTeste,setTimeout,clearTimeout,DOMParser:dom.window.DOMParser,TypeError});
 for(const script of scripts)vm.runInContext(fs.readFileSync(path.join(raiz,'assets/js',script),'utf8'),ctx);
 document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));await settle();
 const el=id=>document.getElementById(id);
 const submit=async(id,botao)=>{el(id).dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:botao||el(id).querySelector('button[type=submit]')}));await settle();};
 return{el,dom,localStorage,chamadas,location,submit,close:()=>dom.window.close()};
}
test('login só salva sessão após senha e segundo fator; não persiste os códigos',async t=>{
 const p=await pagina('login.html',['login.js'],(rota,body)=>body.codigo?{token:'apos-mfa',usuario}:new Response(JSON.stringify({codigo:'MFA_REQUIRED',message:'Informe o código.'}),{status:428}));t.after(p.close);
 p.el('email').value=usuario.email;p.el('senha').value='Senha123!';await p.submit('form-login');
 assert.equal(p.el('login-mfa').hidden,false);assert.equal(p.el('codigo-mfa').required,true);assert.equal(p.localStorage.getItem('oficina.sessao'),null);
 p.el('codigo-mfa').value='123456';await p.submit('form-login');
 assert.deepEqual(p.chamadas.map(c=>c.body),[{email:usuario.email,senha:'Senha123!'},{email:usuario.email,senha:'Senha123!',codigo:'123456'}]);
 assert.equal(p.location.destino,'dashboard.html');assert.equal(JSON.parse(p.localStorage.getItem('oficina.sessao')).token,'apos-mfa');
 assert.doesNotMatch(p.localStorage.getItem('oficina.sessao'),/Senha123!|123456/);assert.equal(p.el('codigo-mfa').value,'');assert.equal(p.el('senha').value,'');
});
test('login informa bloqueio e permite corrigir código inválido sem criar sessão',async t=>{
 let modo=0;
 const p=await pagina('login.html',['login.js'],()=>new Response(JSON.stringify(modo===0?{codigo:'MFA_REQUIRED'}:{message:modo===1?'Código inválido.':'Muitas tentativas.'}),{status:modo===0?428:modo===1?400:429}));t.after(p.close);
 p.el('email').value=usuario.email;p.el('senha').value='Senha123!';await p.submit('form-login');
 modo=1;p.el('codigo-mfa').value='000000';await p.submit('form-login');assert.match(p.el('login-mensagem').textContent,/Código inválido/);assert.equal(p.el('codigo-mfa').readOnly,false);
 modo=2;await p.submit('form-login');assert.match(p.el('login-mensagem').textContent,/Muitas tentativas/);assert.equal(p.localStorage.getItem('oficina.sessao'),null);
});
test('configuração exige confirmação, renova sessão e mostra recuperação somente após ativar',async t=>{
 let ativo=false;
 const codigos=Array.from({length:10},(_,i)=>'ABCD-1234-5678-9012-000'+i);
 const p=await pagina('seguranca.html',['utils.js','seguranca.js'],(rota,body)=>{
  if(rota==='/auth/mfa')return{ativo,disponivel:true,codigosRestantes:ativo?10:0};
  if(rota==='/auth/mfa/cancelar')return new Response(null,{status:204});
  if(rota==='/auth/mfa/preparar')return{chave:'CHAVE-DE-TESTE',uri:'otpauth://totp/teste?secret=CHAVE',expiraEm:'2026-10-21T12:00:00Z'};
  if(rota==='/auth/mfa/ativar'){
   if(body.codigo==='000000')return new Response(JSON.stringify({message:'Código inválido.'}),{status:400});
   ativo=true;return{sessao:{token:'mfa-ativa',usuario},codigosRecuperacao:codigos};
  }
  throw new Error(rota);
 });t.after(p.close);
 p.el('mfa-senha').value='Senha123!';await p.submit('mfa-preparar');assert.equal(p.el('mfa-pendente').hidden,false);assert.equal(p.el('mfa-recuperacao').hidden,true);assert.equal(p.el('mfa-senha').value,'');
 p.el('mfa-cancelar').click();await settle();assert.equal(p.el('mfa-pendente').hidden,true);assert.equal(p.el('mfa-chave').textContent,'');assert.equal(p.chamadas.at(-2).rota,'/auth/mfa/cancelar');p.el('mfa-senha').value='Senha123!';await p.submit('mfa-preparar');
 p.el('mfa-codigo').value='000000';await p.submit('mfa-confirmar');assert.match(p.el('mfa-mensagem').textContent,/Código inválido/);assert.equal(p.el('mfa-pendente').hidden,false);
 p.el('mfa-codigo').value='123456';await p.submit('mfa-confirmar');assert.equal(p.el('mfa-pendente').hidden,true);assert.equal(p.el('mfa-chave').textContent,'');assert.equal(p.el('mfa-uri').hasAttribute('href'),false);
 assert.equal(p.el('mfa-codigos').children.length,10);assert.equal(p.el('mfa-gerenciar').hidden,false);assert.equal(JSON.parse(p.localStorage.getItem('oficina.sessao')).token,'mfa-ativa');
 assert.doesNotMatch(p.localStorage.getItem('oficina.sessao'),/CHAVE|ABCD|Senha123!/);
 p.el('mfa-guardei').click();assert.equal(p.el('mfa-codigos').children.length,0);assert.equal(p.el('mfa-recuperacao').hidden,true);
});
test('desativação envia senha e prova ao servidor e mantém proteção quando recusada',async t=>{
 let ativo=true,permitir=false;
 const p=await pagina('seguranca.html',['utils.js','seguranca.js'],(rota,body)=>{
  if(rota==='/auth/mfa')return{ativo,disponivel:true,codigosRestantes:10};
  if(rota==='/auth/mfa/desativar'){
   assert.deepEqual(body,{senhaAtual:'Senha123!',codigo:'ABCD-1234-5678-9012-3456'});
   if(!permitir)return new Response(JSON.stringify({message:'Código já utilizado.'}),{status:400});
   ativo=false;return{token:'sem-mfa',usuario};
  }
  throw new Error(rota);
 });t.after(p.close);
 p.el('mfa-senha-prova').value='Senha123!';p.el('mfa-codigo-prova').value='ABCD-1234-5678-9012-3456';const botao=p.el('mfa-gerenciar').querySelector('[value=desativar]');await p.submit('mfa-gerenciar',botao);
 assert.match(p.el('mfa-mensagem').textContent,/já utilizado/);assert.equal(p.el('mfa-gerenciar').hidden,false);
 permitir=true;await p.submit('mfa-gerenciar',botao);assert.equal(p.el('mfa-gerenciar').hidden,true);assert.equal(p.el('mfa-preparar').hidden,false);assert.equal(p.el('mfa-senha-prova').value,'');
});
test('sem chave configurada e em conta de aluno não oferece ativação',async t=>{
 const p=await pagina('seguranca.html',['utils.js','seguranca.js'],()=>({ativo:false,disponivel:false,codigosRestantes:0}));t.after(p.close);assert.equal(p.el('mfa-preparar').hidden,true);assert.match(p.el('mfa-explicacao').textContent,/responsável pelo servidor/);
 const q=await pagina('seguranca.html',['utils.js','seguranca.js'],()=>{throw new Error('Não deve consultar configuração profissional.');},{...usuario,tipoUsuario:'PACIENTE'});t.after(q.close);assert.equal(q.el('mfa-configuracao').hidden,true);assert.equal(q.chamadas.filter(c=>c.rota==='/auth/mfa').length,0);
});
