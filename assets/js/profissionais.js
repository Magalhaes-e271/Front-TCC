(() => {
  "use strict";

  function iniciarProfissionais() {
    const elemento = (id) => document.getElementById(id);
    const lista = elemento("profissionais-lista");

    if (!lista || lista.dataset.inicializado === "true") {
      return;
    }

    lista.dataset.inicializado = "true";

    const aviso = elemento("pagina-erro");
    const busca = elemento("busca-profissionais");
    const atualizar = elemento("recarregar");
    const vazio = elemento("estado-vazio");
    const abas = [...document.querySelectorAll("[data-aba]")];

    let usuario = null;
    let relacoes = [];
    let abaAtual = "colegas";
    let carregando = false;
    let processando = false;
    let dadosCarregados = false;

    function criar(tag, classe = "", texto = "") {
      const item = document.createElement(tag);

      if (classe) item.className = classe;
      if (texto) item.textContent = texto;

      return item;
    }

    function mostrarMensagem(texto = "", tipo = "erro") {
      aviso.textContent = texto;
      aviso.hidden = !texto;
      aviso.dataset.tipo = tipo;

      aviso.setAttribute(
          "role",
          tipo === "erro" ? "alert" : "status"
      );
    }

    function pertenceAoUsuario(relacao) {
      return [
        relacao.usuarioSolicitante?.id,
        relacao.usuarioDestinatario?.id
      ].some((id) =>
          id != null && String(id) === String(usuario.id)
      );
    }

    function pendente(relacao) {
      return ["PRENDENTE", "PENDENTE"].includes(
          relacao.solicitacao
      );
    }

    function dadosDoOutro(relacao) {
      const solicitante = relacao.usuarioSolicitante;

      const outro = String(solicitante?.id) === String(usuario.id)
          ? relacao.usuarioDestinatario
          : solicitante;

      const perfil = outro?.perfil || {};

      return {
        nome:
            perfil.nome ||
            outro?.nome ||
            outro?.email ||
            "Usuário",

        email: outro?.email || "",

        ocupacao:
            perfil.ocupacao ||
            outro?.ocupacao ||
            (
                relacao.tipoRelacao === "PROFISSIONAL_PACIENTE"
                    ? "Paciente"
                    : "Profissional"
            ),

        instituicao:
            perfil.instituicao ||
            outro?.instituicao ||
            "Não informada",

        foto:
            perfil.urlFotoPerfil ||
            outro?.urlFotoPerfil ||
            ""
      };
    }

    function normalizar(texto) {
      return String(texto || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
    }

    function sincronizarControles() {
      const ocupado = carregando || processando;

      atualizar.disabled = ocupado;
      busca.disabled = !dadosCarregados || ocupado;

      atualizar.querySelector("span").textContent =
          carregando ? "Atualizando…" : "Atualizar";

      document.querySelectorAll("[data-acao]").forEach((botao) => {
        botao.disabled = ocupado;
      });

      lista.setAttribute("aria-busy", String(ocupado));
    }

    async function executarAcao(relacao, acao) {
      if (carregando || processando) return;

      processando = true;

      mostrarMensagem();
      sincronizarControles();

      try {
        const id = encodeURIComponent(relacao.id);

        if (acao === "aceitar") {
          await window.Oficina.put(
              `/usuario-aluno/${id}/aceitar`,
              {}
          );
        } else {
          await window.Oficina.delete(
              `/usuario-aluno/${id}`
          );
        }

        await carregar();
      } catch (erro) {
        mostrarMensagem(
            erro.message ||
            "Não foi possível atualizar a solicitação."
        );
      } finally {
        processando = false;
        sincronizarControles();
      }
    }

    function botaoAcao(texto, classe, relacao, acao) {
      const botao = criar("button", classe, texto);

      botao.type = "button";
      botao.dataset.acao = acao;
      botao.disabled = carregando || processando;

      botao.addEventListener("click", () => {
        void executarAcao(relacao, acao);
      });

      return botao;
    }

    function criarCartao(relacao) {
      const outro = dadosDoOutro(relacao);

      const recebida =
          String(relacao.usuarioDestinatario?.id) ===
          String(usuario.id);

      const aguardando = pendente(relacao);

      const card = criar("article", "cartao-profissional");
      const cabecalho = criar("header", "cabecalho-profissional");

      const foto = criar("img", "foto-profissional");

      foto.src = "../assets/icons/user-icon.png";
      foto.alt = `Foto de ${outro.nome}`;
      foto.width = 56;
      foto.height = 56;

      void window.Oficina.imagem(foto, outro.foto);

      const identidade = criar("div", "identidade-profissional");

      identidade.append(
          criar("h3", "nome-profissional", outro.nome),
          criar("p", "ocupacao-profissional", outro.ocupacao)
      );

      cabecalho.append(foto, identidade);

      const selo = criar(
          "span",
          aguardando
              ? "status-profissional pendente"
              : "status-profissional",
          aguardando
              ? recebida
                  ? "Solicitação recebida"
                  : "Aguardando resposta"
              : "Colega vinculado"
      );

      const dados = criar("dl", "dados-profissional");

      const linhas = [
        ["Instituição", outro.instituicao],
        ["E-mail", outro.email || "Não informado"]
      ];

      linhas.forEach(([titulo, valor]) => {
        const linha = criar("div");

        linha.append(
            criar("dt", "", titulo),
            criar("dd", "", valor)
        );

        dados.append(linha);
      });

      card.append(cabecalho, selo, dados);

      if (aguardando) {
        const acoes = criar("div", "acoes-solicitacao");

        if (recebida) {
          acoes.append(
              botaoAcao(
                  "Aceitar",
                  "btn-primario",
                  relacao,
                  "aceitar"
              ),
              botaoAcao(
                  "Recusar",
                  "btn-secundario",
                  relacao,
                  "recusar"
              )
          );
        } else {
          acoes.append(
              botaoAcao(
                  "Cancelar solicitação",
                  "btn-secundario",
                  relacao,
                  "cancelar"
              )
          );
        }

        card.append(acoes);
      }

      return card;
    }

    function renderizar() {
      elemento("titulo-lista").textContent =
          abaAtual === "colegas"
              ? "Sua rede de colegas"
              : "Solicitações de vínculo";

      if (!dadosCarregados) return;

      const colegas = relacoes.filter((relacao) =>
          relacao.tipoRelacao === "PROFISSIONAL_PROFISSIONAL" &&
          relacao.solicitacao === "ACEITA"
      );

      const solicitacoes = relacoes.filter(pendente);

      elemento("contador-colegas").textContent =
          String(colegas.length);

      elemento("contador-pendentes").textContent =
          String(solicitacoes.length);

      const origem = abaAtual === "colegas"
          ? colegas
          : solicitacoes;

      const termo = normalizar(busca.value.trim());

      const filtradas = origem.filter((relacao) => {
        const outro = dadosDoOutro(relacao);

        const texto = [
          outro.nome,
          outro.email,
          outro.ocupacao,
          outro.instituicao
        ].join(" ");

        return normalizar(texto).includes(termo);
      });

      lista.replaceChildren(
          ...filtradas.map(criarCartao)
      );

      vazio.hidden = filtradas.length > 0;

      elemento("contador-resultados").textContent =
          `${filtradas.length} ${
              filtradas.length === 1 ? "resultado" : "resultados"
          }`;

      if (!filtradas.length) {
        elemento("titulo-vazio").textContent = termo
            ? "Nenhum resultado encontrado"
            : abaAtual === "colegas"
                ? "Sua rede começa por aqui"
                : "Nenhuma solicitação pendente";

        elemento("texto-vazio").textContent = termo
            ? "Tente outro nome, e-mail, ocupação ou instituição."
            : abaAtual === "colegas"
                ? "Adicione um colega para começar a construir sua rede."
                : "As solicitações enviadas e recebidas aparecerão nesta aba.";
      }

      sincronizarControles();
    }

    async function carregar() {
      if (carregando) return;

      carregando = true;
      dadosCarregados = false;

      lista.replaceChildren();
      vazio.hidden = true;

      elemento("contador-colegas").textContent = "—";
      elemento("contador-pendentes").textContent = "—";
      elemento("contador-resultados").textContent = "Carregando…";

      mostrarMensagem("Carregando profissionais…", "info");
      sincronizarControles();

      try {
        usuario = await window.Oficina.exigirSessao();

        if (usuario.tipoUsuario !== "PROFISSIONAL") {
          throw new Error(
              "Esta página está disponível para profissionais."
          );
        }

        const resposta = await window.Oficina.get(
            "/usuario-aluno"
        );

        if (!Array.isArray(resposta)) {
          throw new Error(
              "O servidor não retornou uma lista válida de vínculos."
          );
        }

        relacoes = resposta.filter((relacao) =>
            relacao &&
            relacao.id != null &&
            relacao.usuarioSolicitante &&
            relacao.usuarioDestinatario &&
            pertenceAoUsuario(relacao)
        );

        dadosCarregados = true;
        mostrarMensagem();
      } catch (erro) {
        elemento("contador-resultados").textContent =
            "Lista indisponível";

        mostrarMensagem(
            erro.message ||
            "Não foi possível carregar os profissionais."
        );
      } finally {
        carregando = false;

        renderizar();
        sincronizarControles();
      }
    }

    function selecionarAba(aba) {
      abaAtual = aba.dataset.aba;

      abas.forEach((item) => {
        const ativa = item === aba;

        item.classList.toggle("ativa", ativa);
        item.setAttribute("aria-pressed", String(ativa));
      });

      renderizar();
    }

    abas.forEach((aba) => {
      aba.addEventListener("click", () => {
        selecionarAba(aba);
      });
    });

    busca.addEventListener("input", renderizar);

    atualizar.addEventListener("click", () => {
      void carregar();
    });

    void carregar();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarProfissionais,
        { once: true }
    );
  } else {
    iniciarProfissionais();
  }
})();