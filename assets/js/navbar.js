(() => {
  const navbar = document.querySelector('.nav-bar');
  document.getElementById('btn-barra-lateral')?.addEventListener('click', () => navbar.classList.toggle('nav-fechada'));
  const destinos = { 'btn-dashboard': 'dashboard.html', 'btn-pacientes': 'dashboard.html', 'btn-profissionais': 'Profissionais.html', 'btn-agenda': 'agenda.html', "btn-user-config": "perfil.html" };
  Object.entries(destinos).forEach(([id,url]) => navegarCom(document.getElementById(id),url));
  document.getElementById('btn-sair')?.addEventListener('click', () => Oficina.sair());
  Oficina.exigirSessao().then(u => {
    const nome = document.getElementById('user-name') || navbar?.querySelector('.nav-header h2');
    if (nome) nome.textContent = u.perfil?.nome || u.email;
    const formacao = document.getElementById('user-formacao');
    if (formacao) formacao.textContent = u.perfil?.formacao || u.perfil?.ocupacao || '';
    const img = document.getElementById('user-img'); if (img) Oficina.imagem(img, u.perfil?.urlFotoPerfil);
    if (u.tipoUsuario === 'PACIENTE') ['btn-profissionais','btn-agenda'].forEach(id => { const e = document.getElementById(id); if(e) e.hidden = true; });
  }).catch(e => Oficina.mensagem(document.getElementById('pagina-erro'), e.message));
})();
