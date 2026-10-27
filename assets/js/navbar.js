(() => {
  const navbar = document.querySelector('.nav-bar');
  document.getElementById('btn-barra-lateral')?.addEventListener('click', () => navbar.classList.toggle('nav-fechada'));
  const destinos = { 'btn-dashboard': 'dashboard.html', 'btn-pacientes': 'dashboard.html', 'btn-profissionais': 'Profissionais.html', 'btn-agenda': 'agenda.html', "btn-user-config": "perfil.html" };
  Object.entries(destinos).forEach(([id,url]) => navegarCom(document.getElementById(id),url));
  document.getElementById('btn-sair')?.addEventListener('click', () => Oficina.sair());
  const botaoProfissionais = document.getElementById('btn-profissionais');
  let notificacao = botaoProfissionais?.querySelector('.nav-notificacao');
  if (botaoProfissionais && !notificacao) {
    notificacao = document.createElement('span');
    notificacao.className = 'nav-notificacao';
    notificacao.hidden = true;
    botaoProfissionais.append(notificacao);
  }
  let notificacaoConsultada = false;
  const atualizarNotificacao = async u => {
    if (!botaoProfissionais || u?.tipoUsuario !== 'PROFISSIONAL' || notificacaoConsultada) return;
    notificacaoConsultada = true;
    try {
      const relacoes = await Oficina.get('/usuario-aluno');
      if (!Array.isArray(relacoes)) {
        throw new Error('O servidor não retornou uma lista válida de solicitações.');
      }
      const pendentes = relacoes.filter(relacao =>
        ['PRENDENTE', 'PENDENTE'].includes(relacao?.solicitacao) &&
        String(relacao.usuarioDestinatario?.id) === String(u.id)
      ).length;
      notificacao.hidden = pendentes === 0;
      notificacao.textContent = pendentes > 9 ? '9+' : String(pendentes);
      const descricao = pendentes
          ? `Profissionais, ${pendentes} solicitação${pendentes === 1 ? '' : 'ões'} pendente${pendentes === 1 ? '' : 's'}`
          : 'Profissionais';
      botaoProfissionais.setAttribute('aria-label', descricao);
      botaoProfissionais.title = descricao;
    } catch (erro) {
      console.warn('Não foi possível verificar solicitações de vínculo.', erro);
    }
  };
  let fotoExibida;
  const exibirUsuario = u => {
    if (!u) return;
    const nome = document.getElementById('user-name') || navbar?.querySelector('.nav-header h2');
    if (nome) nome.textContent = u.perfil?.nome || u.email;
    const formacao = document.getElementById('user-formacao');
    if (formacao) formacao.textContent = u.perfil?.formacao || u.perfil?.ocupacao || '';
    const img = document.getElementById('user-img');
    if (img && fotoExibida !== u.perfil?.urlFotoPerfil) {
      fotoExibida = u.perfil?.urlFotoPerfil;
      Oficina.imagem(img, fotoExibida, true);
    }
    if (u.tipoUsuario === 'PACIENTE') ['btn-agenda'].forEach(id => { const e = document.getElementById(id); if(e) e.hidden = true; });
    void atualizarNotificacao(u);
  };
  exibirUsuario(Oficina.usuario());
  Oficina.exigirSessao().then(exibirUsuario).catch(e => Oficina.mensagem(document.getElementById('pagina-erro'), e.message));
})();
