(async () => {
  const grid = document.getElementById('pacientes-lista');
  const erro = document.getElementById('pagina-erro');
  const recarregar = document.getElementById('recarregar');
  const alunoCriado = Number(new URLSearchParams(location.search).get('alunoCriado'));
  let carregando = false;

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto) e.textContent = texto;
    return e;
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    Oficina.mensagem(erro, 'Carregando pacientes…', 'info');
    recarregar.disabled = true;
    try {
      const u = await Oficina.exigirSessao();
      document.querySelector('.add-patient-button').hidden = u.tipoUsuario !== 'PROFISSIONAL';
      const pacientes = await Oficina.get('/paciente');
      let metasIndisponiveis = false;
      const cards = await Promise.all(pacientes.map(async p => {
        const perfil = p.perfil || {};
        let progresso = 'Indisponível';
        try {
          const metas = await Oficina.get(`/meta?idPaciente=${p.id}`);
          progresso = `${metas.filter(m => m.concluido).length}/${metas.length}`;
        } catch {
          metasIndisponiveis = true;
        }

        const card = el('article', 'patient-card');
        const header = el('header', 'patient-card-header');
        const avatar = el('span', 'patient-avatar');
        const img = el('img');
        Oficina.imagem(img, perfil.urlFotoPerfil);
        avatar.append(img);
        header.append(avatar, el('h2', '', perfil.nome || p.email), el('span', 'patient-status', 'Ativo'));
        const lista = el('dl', 'patient-details');
        [
          ['Idade e condição', `${Oficina.idade(perfil.dataNascimento)} · ${perfil.condicoes || 'Não informada'}`],
          ['Metas atingidas', progresso]
        ].forEach(([titulo, valor]) => {
          const d = el('div');
          d.append(el('dt', '', titulo), el('dd', '', valor));
          lista.append(d);
        });
        const botao = el('button', 'profile-button', 'Abrir perfil →');
        botao.type = 'button';
        botao.addEventListener('click', () => { location.href = `metas.html?paciente=${p.id}`; });
        const dados = el('button', 'profile-button', 'Dados e equipe');
        dados.type = 'button';
        dados.addEventListener('click', () => { location.href = `paciente.html?paciente=${p.id}`; });
        card.append(header, lista, botao, dados);
        return card;
      }));
      grid.replaceChildren(...cards);
      const avisos = [];
      if (u.tipoUsuario === 'PROFISSIONAL' && alunoCriado > 0 &&
          pacientes.some(p => Number(p.id) === alunoCriado)) {
        avisos.push('Aluno cadastrado e adicionado à sua lista.');
      }
      if (!pacientes.length) avisos.push('Nenhum paciente cadastrado.');
      if (metasIndisponiveis) avisos.push('Não foi possível carregar algumas metas. Atualize para tentar novamente.');
      Oficina.mensagem(erro, avisos.join(' '), 'info');
    } catch (e) {
      Oficina.mensagem(erro, e.message);
    } finally {
      carregando = false;
      recarregar.disabled = false;
    }
  }
  recarregar.addEventListener('click', carregar);
  window.addEventListener('pageshow', event => {
    if (event.persisted) void carregar();
  });
  await carregar();
})();
