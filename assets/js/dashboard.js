(async () => {
  const grid = document.getElementById('pacientes-lista'); const erro = document.getElementById('pagina-erro');
  const recarregar = document.getElementById('recarregar');
  function el(tag,classe,texto) { const e=document.createElement(tag); if(classe)e.className=classe; if(texto)e.textContent=texto; return e; }
  async function carregar() {
    Oficina.mensagem(erro,'Carregando pacientes…','info'); recarregar.disabled = true;
    try {
      const u = await Oficina.exigirSessao();
      document.querySelector('.add-patient-button').hidden = u.tipoUsuario !== 'PROFISSIONAL';
      const pacientes = await Oficina.get('/paciente');
      const cards = await Promise.all(pacientes.map(async p => {
        const perfil = p.perfil || {}; const metas = await Oficina.get(`/meta?idPaciente=${p.id}`);
        const card = el('article','patient-card'); const header=el('header','patient-card-header');
        const avatar=el('span','patient-avatar'); const img=el('img'); Oficina.imagem(img,perfil.urlFotoPerfil); avatar.append(img);
        header.append(avatar,el('h2','',perfil.nome || p.email),el('span','patient-status','Ativo'));
        const lista=el('dl','patient-details');
        [['Idade e condição', `${Oficina.idade(perfil.dataNascimento)} · ${perfil.condicoes || 'Não informada'}`],['Metas atingidas',`${metas.filter(m=>m.concluido).length}/${metas.length}`]].forEach(([titulo,valor])=> { const d=el('div'); d.append(el('dt','',titulo),el('dd','',valor)); lista.append(d); });
        const botao=el('button','profile-button','Abrir perfil →'); botao.type='button'; botao.addEventListener('click',()=> { location.href=`metas.html?paciente=${p.id}`; });
        card.append(header,lista,botao); return card;
      }));
      grid.replaceChildren(...cards); Oficina.mensagem(erro,pacientes.length ? '' : 'Nenhum paciente cadastrado.','info');
    } catch (e) { Oficina.mensagem(erro,e.message); } finally { recarregar.disabled=false; }
  }
  recarregar.addEventListener('click',carregar); await carregar();
})();
