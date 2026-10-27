(async () => {
  const erro = document.getElementById('pagina-erro');
  const descricao = document.getElementById('descricaoForm');
  try {
    const usuario = await Oficina.exigirSessao(); const perfil = usuario.perfil || {};
    if (descricao) {
      const doc = new DOMParser().parseFromString(perfil.conteudoHtml || '', 'text/html');
      document.getElementById('descricao').value = doc.body.textContent;
      document.getElementById('pular-descricao').addEventListener('click', () => { location.href = 'dashboard.html'; });
      descricao.addEventListener('submit', e => {
        e.preventDefault(); Oficina.mensagem(erro,'');
        Oficina.ocupar(descricao.querySelector('[type=submit]'), async () => {
          await Oficina.put(`/usuario/descricao?id=${usuario.id}`, { conteudoHtml: Oficina.textoHTML(document.getElementById('descricao').value) });
          location.href = 'dashboard.html';
        }, erro);
      });
    }
  } catch (e) { Oficina.mensagem(erro,e.message); }
})();
