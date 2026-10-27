(() => {
  'use strict';
  const form=document.getElementById('form-ativacao');const aviso=document.getElementById('pagina-erro');
  const token=new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null,'',location.pathname);
  if(!token){Oficina.mensagem(aviso,'Este link não contém uma ativação válida. Solicite um novo link ao profissional.');form.hidden=true;return;}
  form.addEventListener('submit',event=>{
    event.preventDefault();const senha=document.getElementById('ativacao-senha').value;
    if(senha!==document.getElementById('ativacao-confirmar').value){Oficina.mensagem(aviso,'As senhas não coincidem.');return;}
    Oficina.ocupar(event.submitter || form.querySelector('button[type="submit"]'),async()=>{
      const resposta=await Oficina.post('/auth/ativar',{token,senha},{auth:false});Oficina.guardarSessao(resposta);form.reset();location.replace('dashboard.html');
    },aviso);
  });
})();
