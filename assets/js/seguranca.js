(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const api = window.Oficina;
  let ocupado = false, codigos = [];
  const avisar = (texto, tipo = "erro") => api.mensagem(el("mfa-mensagem"), texto, tipo);
  function limparPreparacao() {
    el("mfa-pendente").hidden = true; el("mfa-chave").textContent = "";
    el("mfa-uri").removeAttribute("href"); el("mfa-codigo").value = "";
  }
  async function carregar() {
    const estado = await api.get("/auth/mfa");
    el("mfa-configuracao").hidden = false;
    el("mfa-situacao").textContent = estado.ativo ? "Proteção ativada" : "Proteção ainda não ativada";
    el("mfa-explicacao").textContent = estado.ativo
      ? "Seu login exige senha e código do autenticador ou recuperação."
      : estado.disponivel ? "Ative uma segunda confirmação para entrar na sua conta."
      : "A configuração ainda precisa ser habilitada pelo responsável pelo servidor.";
    el("mfa-preparar").hidden = estado.ativo || !estado.disponivel;
    el("mfa-gerenciar").hidden = !estado.ativo;
    el("mfa-reservas").textContent = `${estado.codigosRestantes} códigos de recuperação disponíveis.`;
  }
  async function executar(acao) {
    if (ocupado) return;
    ocupado = true; avisar("");
    document.querySelectorAll("button,input").forEach(e => { e.disabled = true; });
    try { await acao(); }
    catch (e) { avisar(e.message); }
    finally { ocupado = false; document.querySelectorAll("button,input").forEach(e => { e.disabled = false; }); }
  }
  function receber(resultado) {
    api.guardarSessao(resultado.sessao);
    codigos = resultado.codigosRecuperacao;
    el("mfa-codigos").replaceChildren(...codigos.map(codigo => {
      const li = document.createElement("li"); li.textContent = codigo; return li;
    }));
    el("mfa-recuperacao").hidden = false;
  }
  el("mfa-preparar").addEventListener("submit", e => {
    e.preventDefault(); if (!e.currentTarget.reportValidity()) return;
    executar(async () => {
      const r = await api.post("/auth/mfa/preparar", {senhaAtual: el("mfa-senha").value});
      el("mfa-senha").value = ""; el("mfa-preparar").hidden = true;
      el("mfa-chave").textContent = r.chave; el("mfa-uri").href = r.uri;
      el("mfa-prazo").textContent = `Confirme até ${new Date(r.expiraEm).toLocaleTimeString("pt-BR")}.`;
      el("mfa-pendente").hidden = false;
      avisar("Chave preparada. Confirme o código para ativar a proteção.", "info");
    });
  });
  el("mfa-confirmar").addEventListener("submit", e => {
    e.preventDefault(); if (!e.currentTarget.reportValidity()) return;
    executar(async () => {
      const r = await api.post("/auth/mfa/ativar", {codigo: el("mfa-codigo").value});
      receber(r); limparPreparacao(); await carregar();
      avisar("Proteção ativada. Guarde seus códigos de recuperação antes de sair.", "sucesso");
    });
  });
  el("mfa-cancelar").addEventListener("click", () => executar(async () => { await api.post("/auth/mfa/cancelar", {}); limparPreparacao(); await carregar(); }));
  el("mfa-gerenciar").addEventListener("submit", e => {
    e.preventDefault(); if (!e.currentTarget.reportValidity()) return;
    const acao = e.submitter?.value; if (!["recuperacao", "desativar"].includes(acao)) return;
    if (acao === "desativar" && !window.confirm("Desativar a verificação em duas etapas desta conta?")) return;
    executar(async () => {
      const r = await api.post("/auth/mfa/" + acao, {senhaAtual: el("mfa-senha-prova").value, codigo: el("mfa-codigo-prova").value});
      el("mfa-gerenciar").reset();
      if (acao === "recuperacao") receber(r);
      else { api.guardarSessao(r); codigos = []; el("mfa-codigos").replaceChildren(); el("mfa-recuperacao").hidden = true; }
      await carregar(); avisar(acao === "recuperacao" ? "Novos códigos gerados. Os anteriores foram invalidados." : "Verificação em duas etapas desativada.", "sucesso");
    });
  });
  el("mfa-baixar").addEventListener("click", () => {
    if (!codigos.length) return;
    const texto = "OficinaAprender — códigos de recuperação\nGuarde em local seguro. Cada código pode ser usado uma vez junto da senha.\n\n" + codigos.join("\n");
    const url = URL.createObjectURL(new Blob([texto], {type: "text/plain;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = "oficina-codigos-recuperacao.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el("mfa-guardei").addEventListener("click", () => { codigos = []; el("mfa-codigos").replaceChildren(); el("mfa-recuperacao").hidden = true; });
  window.addEventListener("beforeunload", e => { if (codigos.length) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => { limparPreparacao(); codigos = []; el("mfa-codigos").replaceChildren(); });
  window.addEventListener("pageshow", e => { if (e.persisted) location.reload(); });
  executar(async () => {
    const usuario = await api.exigirSessao();
    if (usuario.tipoUsuario !== "PROFISSIONAL") throw new Error("Esta configuração está disponível para contas profissionais.");
    await carregar();
  });
})();
