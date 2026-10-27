(async () => {
  "use strict";
  const el = (id) => document.getElementById(id);
  const form = el("patientForm");
  if (!form) return;
  const erro = el("pagina-erro");
  const chave = "oficina.paciente";
  const ids = [
    "nome",
    "dataNascimento",
    "email",
    "celular",
    "condicao",
    "problemas",
  ];
  const partes = [
    "parte-dados-aluno",
    "parte-acompanhamento",
    "parte-equipe",
  ].map(el);
  const avancar = el("continuar-aluno");
  const voltar = el("voltar-etapa-aluno");
  const campoFoto = el("foto-paciente");
  const selecionados = new Map();
  let usuario,
    etapa = 0,
    ocupado = false,
    pronto = false,
    salvoId = null;
  let resultados = [],
    buscando = false,
    sequenciaBusca = 0,
    urlFoto = null;

  const ler = () => {
    try {
      return JSON.parse(sessionStorage.getItem(chave)) || {};
    } catch {
      return {};
    }
  };
  function guardar(dados) {
    try {
      sessionStorage.setItem(chave, JSON.stringify(dados));
    } catch {
      throw new Error(
        "Não foi possível guardar o cadastro neste navegador. Verifique o espaço disponível ou escolha uma foto menor.",
      );
    }
  }
  function snapshot() {
    return {
      ...ler(),
      ...Object.fromEntries(
        ids
          .filter((id) => id !== "condicao")
          .map((id) => [id, el(id).value.trim()]),
      ),
      condicoes: el("condicao").value.trim(),
      equipe: [...selecionados.values()],
      salvoId,
    };
  }
  function criar(tag, texto, classe) {
    const item = document.createElement(tag);
    if (texto) item.textContent = texto;
    if (classe) item.className = classe;
    return item;
  }
  function sincronizar() {
    partes.forEach((parte) =>
      parte.querySelectorAll("input,textarea,button").forEach((campo) => {
        campo.disabled =
          !pronto || Boolean(salvoId) || (ocupado && etapa === 2);
      }),
    );
    el("pesquisar-equipe-aluno").disabled ||= buscando;
    avancar.disabled = !pronto || ocupado;
    voltar.disabled = ocupado || Boolean(salvoId);
    voltar.hidden = etapa === 0 || Boolean(salvoId);
    el("continuar-texto-aluno").textContent = ocupado
      ? "Aguarde…"
      : etapa === 2
        ? salvoId
          ? "Tentar enviar a foto"
          : "Concluir cadastro"
        : "Continuar";
    form.setAttribute("aria-busy", String(ocupado));
  }
  function mostrarEtapa(indice, focar = true) {
    etapa = indice;
    partes.forEach((parte, i) => {
      parte.hidden = i !== etapa;
    });
    document.querySelectorAll(".passos-aluno li").forEach((item, i) => {
      if (i === etapa) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    el("etapa-aluno").textContent = [
      "ETAPA 1 DE 3 · DADOS DO ALUNO",
      "ETAPA 2 DE 3 · ACOMPANHAMENTO",
      "ETAPA 3 DE 3 · EQUIPE DE APOIO",
    ][etapa];
    el("titulo-pagina").textContent = [
      "Vamos conhecer o aluno",
      "Conte sobre o aluno",
      "Uma equipe para acompanhar",
    ][etapa];
    el("introducao-etapa").textContent = [
      "Comece pela identificação e pelos dados de contato. Você pode voltar e ajustar as informações antes de concluir.",
      "Registre as condições e dificuldades para orientar o acompanhamento.",
      "Revise quem vai acompanhar o aluno e conclua o cadastro.",
    ][etapa];
    el("contador-aluno").textContent = [
      "Próximo: acompanhamento",
      "Próximo: equipe de apoio",
      "Etapa 3 de 3",
    ][etapa];
    history.replaceState(
      null,
      "",
      location.pathname +
        location.search +
        ["", "#acompanhamento", "#equipe"][etapa],
    );
    sincronizar();
    if (focar) el("titulo-pagina").focus();
  }
  function validar(indice, reportar = true) {
    const controles = [...partes[indice].querySelectorAll("input,textarea")];
    const invalidos = controles.filter((campo) => {
      if (["text", "email", "tel", "textarea"].includes(campo.type))
        campo.value = campo.value.trim();
      return !campo.checkValidity();
    });
    if (invalidos.length && reportar) {
      invalidos[0].reportValidity();
      invalidos[0].focus();
    }
    return !invalidos.length;
  }
  function mensagemFoto(texto = "") {
    campoFoto.setCustomValidity(texto);
    campoFoto.setAttribute("aria-invalid", String(Boolean(texto)));
    el("foto-erro").textContent = texto;
    el("foto-erro").hidden = !texto;
  }
  function mostrarFoto(origem, nome) {
    el("aluno-foto-preview").hidden = !origem;
    if (origem) el("aluno-foto-preview").src = origem;
    else el("aluno-foto-preview").removeAttribute("src");
    el("foto-placeholder").hidden = Boolean(origem);
    el("foto-nome").textContent =
      nome ||
      (origem
        ? "Foto selecionada anteriormente."
        : "Nenhuma foto selecionada.");
    el("foto-botao-texto").textContent = origem
      ? "Trocar foto"
      : "Escolher foto";
    el("remover-foto-aluno").hidden = !origem && !campoFoto.files.length;
  }
  function liberarFoto() {
    if (urlFoto) {
      URL.revokeObjectURL(urlFoto);
      urlFoto = null;
    }
  }
  function problemaFoto(file) {
    if (file.size > 2 * 1024 * 1024) return "Use uma foto de até 2 MB.";
    if (!["image/png", "image/jpeg", "image/gif"].includes(file.type))
      return "Escolha uma foto PNG, JPEG ou GIF.";
    return "";
  }
  async function guardarFormulario() {
    const dados = snapshot();
    const file = campoFoto.files[0];
    if (file) {
      const problema = problemaFoto(file);
      if (problema) throw new Error(problema);
      dados.foto = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a foto."));
        reader.readAsDataURL(file);
      });
      dados.fotoNome = file.name;
    }
    guardar(dados);
    return dados;
  }
  function renderizarEquipe() {
    const lista = el("resultados-equipe-aluno");
    lista.replaceChildren();
    resultados.forEach((profissional) => {
      const label = criar("label", "", "opcao-equipe-aluno");
      const check = criar("input");
      check.type = "checkbox";
      check.value = String(profissional.id);
      check.checked = selecionados.has(profissional.id);
      const dados = criar("span");
      dados.append(
        criar("strong", profissional.nome),
        criar(
          "small",
          profissional.email || profissional.ocupacao || "Profissional",
        ),
      );
      check.addEventListener("change", () => {
        if (ocupado || salvoId) return;
        if (check.checked && selecionados.size >= 30) {
          check.checked = false;
          Oficina.mensagem(erro, "Você pode convidar até 30 profissionais.");
          return;
        }
        if (check.checked) selecionados.set(profissional.id, profissional);
        else selecionados.delete(profissional.id);
        try {
          guardar(snapshot());
        } catch (e) {
          Oficina.mensagem(erro, e.message);
        }
        renderizarEquipe();
      });
      label.append(check, dados);
      lista.append(label);
    });
    const chips = el("selecionados-equipe-aluno");
    chips.replaceChildren();
    selecionados.forEach((profissional) => {
      const item = criar("li");
      const botao = criar("button", profissional.nome + " ×");
      botao.type = "button";
      botao.setAttribute(
        "aria-label",
        "Remover convite para " + profissional.nome,
      );
      botao.addEventListener("click", () => {
        if (ocupado || salvoId) return;
        selecionados.delete(profissional.id);
        try {
          guardar(snapshot());
        } catch (e) {
          Oficina.mensagem(erro, e.message);
        }
        renderizarEquipe();
      });
      item.append(botao);
      chips.append(item);
    });
    el("contador-equipe-aluno").textContent = selecionados.size
      ? `${selecionados.size} ${selecionados.size === 1 ? "convite selecionado" : "convites selecionados"}.`
      : "Nenhum convite selecionado.";
    sincronizar();
  }
  async function pesquisarEquipe() {
    if (!pronto || ocupado || salvoId || etapa !== 2) return;
    const pedido = ++sequenciaBusca;
    buscando = true;
    sincronizar();
    el("resultados-equipe-aluno").setAttribute("aria-busy", "true");
    el("estado-equipe-aluno").textContent = "Pesquisando profissionais…";
    try {
      const encontrados = await Oficina.get(
        "/usuario/buscar?nome=" +
          encodeURIComponent(el("buscar-equipe-aluno").value.trim()),
      );
      if (pedido !== sequenciaBusca) return;
      if (!Array.isArray(encontrados))
        throw new Error(
          "O servidor não retornou uma lista válida de profissionais.",
        );
      const unicos = new Map();
      encontrados.forEach((p) => {
        const id = Number(p?.id);
        if (
          !Number.isSafeInteger(id) ||
          id <= 0 ||
          id === Number(usuario.id) ||
          (p.tipoUsuario && p.tipoUsuario !== "PROFISSIONAL")
        )
          return;
        unicos.set(id, {
          id,
          nome: p.perfil?.nome || p.nome || p.email || "Profissional",
          email: p.email || "",
          ocupacao: p.perfil?.ocupacao || "",
        });
      });
      resultados = [...unicos.values()];
      el("estado-equipe-aluno").textContent = resultados.length
        ? `${resultados.length} ${resultados.length === 1 ? "profissional disponível" : "profissionais disponíveis"}.`
        : "Nenhum profissional encontrado. Você pode pesquisar outro nome ou concluir sem convites.";
    } catch (e) {
      if (pedido !== sequenciaBusca) return;
      resultados = [];
      el("estado-equipe-aluno").textContent =
        `${e.message} Tente pesquisar novamente ou conclua sem convites.`;
    } finally {
      if (pedido === sequenciaBusca) {
        buscando = false;
        el("resultados-equipe-aluno").setAttribute("aria-busy", "false");
        renderizarEquipe();
      }
    }
  }
  async function concluir(dados) {
    if (!salvoId) {
      const paciente = await Oficina.post("/paciente/criar", {
        email: dados.email,
        perfilUsuario: {
          nome: dados.nome,
          telefone: dados.celular,
          dataNascimento: dados.dataNascimento,
          condicoes: dados.condicoes,
          conteudoHtml: Oficina.textoHTML(dados.problemas),
        },
        profissionais: [...selecionados.keys()],
      });
      const id = Number(paciente?.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new Error("O servidor não retornou o identificador do aluno.");
      salvoId = id;
      dados.salvoId = id;
      guardar(dados);
    }
    if (dados.foto) {
      try {
        const resposta = await fetch(dados.foto);
        if (!resposta.ok)
          throw new Error("Não foi possível ler a foto selecionada.");
        const blob = await resposta.blob();
        await Oficina.foto(
          salvoId,
          new File([blob], dados.fotoNome || "foto.png", { type: blob.type }),
        );
      } catch (e) {
        throw new Error(
          `Aluno salvo e vinculado a você. A foto não foi enviada: ${e.message} Clique em Tentar enviar a foto para tentar novamente.`,
        );
      }
    }
    sessionStorage.removeItem(chave);
    location.href = "dashboard.html?alunoCriado=" + encodeURIComponent(salvoId);
  }

  try {
    usuario = await Oficina.exigirSessao();
    if (usuario.tipoUsuario !== "PROFISSIONAL")
      throw new Error("Só profissionais podem cadastrar alunos.");
    const dados = ler();
    ids.forEach((id) => {
      el(id).value = dados[id === "condicao" ? "condicoes" : id] || "";
    });
    el("dataNascimento").max = new Date().toLocaleDateString("en-CA");
    el("profissional-criador").textContent =
      usuario.perfil?.nome || usuario.email || "Seu perfil profissional";
    (Array.isArray(dados.equipe) ? dados.equipe : [])
      .slice(0, 30)
      .forEach((p) => {
        if (
          Number.isSafeInteger(p.id) &&
          p.id > 0 &&
          p.id !== Number(usuario.id)
        )
          selecionados.set(p.id, p);
      });
    // Retoma também seleções do cadastro anterior, que guardava somente os IDs.
    (Array.isArray(dados.profissionais) ? dados.profissionais : [])
      .slice(0, 30)
      .forEach((id) => {
        if (
          Number.isSafeInteger(id) &&
          id > 0 &&
          id !== Number(usuario.id) &&
          !selecionados.has(id)
        )
          selecionados.set(id, { id, nome: "Profissional " + id });
      });
    if (Number.isSafeInteger(dados.salvoId) && dados.salvoId > 0)
      salvoId = dados.salvoId;
    pronto = true;
    mostrarFoto(dados.foto, dados.fotoNome);
    const destino = location.hash;
    mostrarEtapa(0, false);
    if (salvoId) {
      mostrarEtapa(2, false);
      Oficina.mensagem(
        erro,
        "Aluno já salvo e vinculado a você. Conclua o envio da foto.",
        "info",
      );
    } else if (
      ["#acompanhamento", "#equipe"].includes(destino) &&
      validar(0, false)
    ) {
      mostrarEtapa(1, false);
      if (destino === "#equipe" && validar(1, false)) mostrarEtapa(2, false);
    }
    renderizarEquipe();
    if (etapa === 2 && !salvoId) void pesquisarEquipe();

    campoFoto.addEventListener("change", () => {
      liberarFoto();
      mensagemFoto();
      const file = campoFoto.files[0];
      if (!file) {
        const atual = ler();
        mostrarFoto(atual.foto, atual.fotoNome);
        return;
      }
      const problema = problemaFoto(file);
      if (problema) {
        mostrarFoto(null, file.name);
        mensagemFoto(problema);
        return;
      }
      urlFoto = URL.createObjectURL(file);
      mostrarFoto(urlFoto, file.name);
    });
    el("aluno-foto-preview").addEventListener("error", () => {
      mostrarFoto(null, campoFoto.files[0]?.name);
      if (campoFoto.files.length)
        mensagemFoto("Não foi possível abrir essa imagem. Escolha outra foto.");
    });
    el("remover-foto-aluno").addEventListener("click", () => {
      try {
        const atual = ler();
        delete atual.foto;
        delete atual.fotoNome;
        guardar(atual);
        campoFoto.value = "";
        liberarFoto();
        mensagemFoto();
        mostrarFoto(null);
        campoFoto.focus();
      } catch (e) {
        Oficina.mensagem(erro, e.message);
      }
    });
    window.addEventListener("pagehide", liberarFoto);
    el("pesquisar-equipe-aluno").addEventListener("click", () => {
      void pesquisarEquipe();
    });
    el("buscar-equipe-aluno").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void pesquisarEquipe();
      }
    });
    voltar.addEventListener("click", () => {
      if (ocupado || salvoId) return;
      Oficina.mensagem(erro, "");
      try {
        guardar(snapshot());
        mostrarEtapa(etapa - 1);
      } catch (e) {
        Oficina.mensagem(erro, e.message);
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!pronto || ocupado) return;
      Oficina.mensagem(erro, "");
      if (!salvoId && !validar(etapa)) return;
      ocupado = true;
      sincronizar();
      try {
        const dados = await guardarFormulario();
        if (etapa < 2) {
          mostrarEtapa(etapa + 1);
        } else {
          ++sequenciaBusca;
          buscando = false;
          await concluir(dados);
        }
      } catch (e) {
        Oficina.mensagem(erro, e.message);
        erro.focus();
      } finally {
        ocupado = false;
        sincronizar();
        if (etapa === 2 && !salvoId && !resultados.length && !buscando)
          void pesquisarEquipe();
      }
    });
  } catch (e) {
    Oficina.mensagem(erro, e.message);
  }
})();
