(async () => {
  'use strict';
  const el = id => document.getElementById(id);
  const aviso = el('pagina-erro');
  const id = new URLSearchParams(location.search).get('paciente');
  let usuario, paciente;
  const mensagem = (texto='', tipo='erro') => Oficina.mensagem(aviso,texto,tipo);
  const criar = (tag,texto='') => {const e=document.createElement(tag);e.textContent=texto;return e;};
  function textoDeHtml(html) {
    const doc = new DOMParser().parseFromString(Oficina.htmlSeguro(html || ''),'text/html');
    doc.querySelectorAll('br').forEach(e=>e.replaceWith(doc.createTextNode('\n')));
    doc.querySelectorAll('p,div,li').forEach(e=>e.append(doc.createTextNode('\n')));
    return doc.body.textContent.trim();
  }
  async function equipe() {
    const resposta = await Oficina.get(`/paciente/${id}/equipe`);
    if (!Array.isArray(resposta)) {
      throw new Error('O servidor não retornou uma lista válida de vínculos.');
    }
    const relacoes = resposta.filter(r =>
      r?.tipoRelacao === 'PROFISSIONAL_PACIENTE' &&
      [r.usuarioSolicitante?.id, r.usuarioDestinatario?.id]
        .some(participante => String(participante) === String(id))
    );
    const gestor = String(paciente.criadoPorId) === String(usuario.id);
    const lista = relacoes.map(r=>{
      const outro = String(r.usuarioSolicitante.id) === String(id) ? r.usuarioDestinatario : r.usuarioSolicitante;
      const pendente = r.solicitacao !== 'ACEITA';
      const item=criar('li'); const dados=criar('div',outro.perfil?.nome || outro.nome || outro.email);
      dados.append(criar('small',pendente?'Aguardando aceite':'Vínculo aceito'));
      item.append(dados);
      const participante=[r.usuarioSolicitante.id,r.usuarioDestinatario.id].some(i=>String(i)===String(usuario.id));
      if (participante || gestor || (pendente && String(r.convidadoPorId)===String(usuario.id))) {
        const botao=criar('button',pendente?'Cancelar convite':'Remover vínculo');botao.type='button';botao.className='gestao-botao secundario';
        botao.addEventListener('click',()=>{
          if(!confirm('Remover este vínculo de acompanhamento?'))return;
          Oficina.ocupar(botao,async()=>{await Oficina.delete(`/usuario-aluno/${r.id}`);await equipe();mensagem('Vínculo removido.','sucesso');},aviso);
        });item.append(botao);
      }
      return item;
    });
    el('paciente-equipe').replaceChildren(...lista);
  }
  try {
    if(!/^[1-9]\d*$/.test(id||''))throw new Error('Abra o paciente pelo painel.');
    usuario=await Oficina.exigirSessao();paciente=await Oficina.get(`/paciente/${id}`);
    const perfil=paciente.perfil||{};
    el('paciente-titulo').textContent=perfil.nome||'Paciente';
    el('abrir-metas').href=`metas.html?paciente=${id}`;
    el('paciente-nome').value=perfil.nome||'';el('paciente-email').value=paciente.email||'';
    el('paciente-nascimento').value=String(perfil.dataNascimento||'').slice(0,10);
    el('paciente-nascimento').max=new Date().toLocaleDateString('en-CA');
    el('paciente-telefone').value=perfil.telefone||'';el('paciente-condicao').value=perfil.condicoes||perfil.condicao||'';
    el('paciente-descricao').value=textoDeHtml(perfil.conteudoHtml);
    const profissional=usuario.tipoUsuario==='PROFISSIONAL';
    if(!profissional){el('form-paciente').querySelectorAll('input,textarea,button').forEach(c=>c.disabled=true);el('salvar-paciente').hidden=true;el('form-convite').hidden=true;}
    el('ativacao-paciente').hidden=!profissional||String(paciente.criadoPorId)!==String(usuario.id);
    if(paciente.acessoHabilitado){el('gerar-ativacao').hidden=true;el('ativacao-ajuda').textContent='O paciente já ativou seu acesso.';}
    await equipe();el('conteudo-paciente').hidden=false;
    await Oficina.imagem(el('paciente-foto'),perfil.urlFotoPerfil);
  } catch(e){mensagem(e.message);return;}
  el('form-paciente').addEventListener('submit',event=>{
    event.preventDefault();Oficina.ocupar(el('salvar-paciente'),async()=>{
      const perfil={nome:el('paciente-nome').value.trim(),telefone:el('paciente-telefone').value.trim(),
        dataNascimento:el('paciente-nascimento').value||null,condicoes:el('paciente-condicao').value.trim(),conteudoHtml:Oficina.textoHTML(el('paciente-descricao').value)};
      await Oficina.put(`/usuario/descricao?id=${id}`,perfil);
      el('paciente-titulo').textContent=perfil.nome;
      const foto=el('paciente-nova-foto').files[0];
      if(foto){try{const atual=await Oficina.foto(id,foto);await Oficina.imagem(el('paciente-foto'),atual.urlFotoPerfil);el('paciente-nova-foto').value='';}
        catch(e){throw new Error('Os dados foram salvos. A foto não foi atualizada: '+e.message);}}
      mensagem('Informações atualizadas.','sucesso');
    },aviso);
  });
  el('botao-buscar').addEventListener('click',()=>Oficina.ocupar(el('botao-buscar'),async()=>{
    const lista=await Oficina.get(`/usuario/buscar?nome=${encodeURIComponent(el('buscar-profissional').value.trim())}`);
    el('selecionar-profissional').replaceChildren(...lista.map(p=>{const o=criar('option',p.perfil?.nome||p.nome||p.email);o.value=p.id;return o;}));
    if(!lista.length)mensagem('Nenhum profissional encontrado.','info');
  },aviso));
  el('form-convite').addEventListener('submit',event=>{event.preventDefault();Oficina.ocupar(event.submitter || el('form-convite').querySelector('button[type="submit"]'),async()=>{
    const selecionado=Number(el('selecionar-profissional').value);
    if(!Number.isSafeInteger(selecionado)||selecionado<=0)throw new Error('Selecione um profissional.');
    await Oficina.post(`/paciente/${id}/equipe`,{idProfissional:selecionado});await equipe();mensagem('Convite enviado. Aguardando aceite do profissional.','sucesso');
  },aviso);});
  el('gerar-ativacao').addEventListener('click',()=>Oficina.ocupar(el('gerar-ativacao'),async()=>{
    const resposta=await Oficina.post(`/paciente/${id}/ativacao`,{});
    const link=new URL('ativar.html',location.href);link.hash=new URLSearchParams({token:resposta.token}).toString();
    el('link-ativacao').value=link.href;el('ativacao-resultado').hidden=false;
    mensagem('Link gerado. Entregue-o ao paciente ou responsável.','sucesso');
  },aviso));
  el('copiar-ativacao').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(el('link-ativacao').value);mensagem('Link copiado.','sucesso');}
    catch{el('link-ativacao').select();mensagem('Selecione e copie o link com Ctrl+C.','info');}
  });
})();
