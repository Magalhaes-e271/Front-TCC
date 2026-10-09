(() => {
  "use strict";

  function iniciarPagina() {
    const elemento = (id) => document.getElementById(id);
    const form = elemento("busca-form");

    if (!form || form.dataset.inicializado === "true") {
      return;
    }

    form.dataset.inicializado = "true";

    const lista = elemento("profissionais-lista");
    const busca = elemento("searchInput");
    const salvar = elemento("criarBtn");
    const pesquisar = elemento("buscarBtn");
    const limpar = elemento("limpar-selecao");
    const atualizar = elemento("recarregar");
    const estado = elemento("estado-lista");

    const cadastro = new URLSearchParams(
        window.location.search
    ).has("cadastro");

    const selecionados = new Map();
    const existentes = new Set();

    const CHAVE = "oficina.paciente";

    let usuario = null;
    let dadosCadastro = null;
    let resultados = [];

    let pronto = false;
    let iniciando = false;
    let buscando = false;
    let enviando = false;
    let erroBusca = false;

    let sequencia = 0;
    let timer;

    function criar(tag, classe = "", texto = "") {
      const item = document.createElement(tag);

      if (classe) {
        item.className = classe;
      }

      if (texto) {
        item.textContent = texto;
      }

      return item;
    }

    function mensagem(texto = "", tipo = "erro") {
      window.Oficina.mensagem(
          elemento("pagina-erro"),
          texto,
          tipo
      );
    }

    function pacienteSalvo() {
      return cadastro && Boolean(dadosCadastro?.salvoId);
    }

    function sincronizar() {
      const bloqueado = !pronto || iniciando || enviando;

      busca.disabled = bloqueado;
      pesquisar.disabled = bloqueado || buscando;
      atualizar.disabled = iniciando || enviando || buscando;

      limpar.disabled = bloqueado || pacienteSalvo();
      limpar.hidden = selecionados.size === 0;

      salvar.disabled =
          bloqueado ||
          buscando ||
          (!cadastro && selecionados.size === 0);

      salvar.textContent = enviando
          ? (cadastro ? "Concluindo…" : "Enviando…")
          : (cadastro ? "Concluir cadastro" : "Enviar solicitações");

      pesquisar.querySelector("span").textContent = buscando
          ? "Pesquisando…"
          : "Pesquisar";

      elemento("contador-selecao").textContent =
          `${selecionados.size} ${
              selecionados.size === 1
                  ? "profissional selecionado"
                  : "profissionais selecionados"
          }`;

      lista
          .querySelectorAll("input[type='checkbox']")
          .forEach((check) => {
            check.disabled = bloqueado || pacienteSalvo();
          });

      lista.setAttribute(
          "aria-busy",
          String(buscando || iniciando)
      );
    }

    function renderizar() {
      lista.replaceChildren();

      elemento("contador-resultados").textContent =
          buscando || iniciando
              ? "Pesquisando…"
              : `${resultados.length} ${
                  resultados.length === 1
                      ? "resultado"
                      : "resultados"
              }`;

      estado.hidden =
          !buscando &&
          !iniciando &&
          resultados.length > 0;

      estado.textContent = buscando || iniciando
          ? "Carregando profissionais…"
          : !pronto || erroBusca
              ? "A lista está indisponível. Tente atualizar ou pesquisar novamente."
              : "Nenhum profissional disponível para esta busca. Tente outro nome ou e-mail.";

      if (buscando || iniciando) {
        sincronizar();
        return;
      }

      resultados.forEach((profissional) => {
        const perfil = profissional.perfil || profissional;

        const nome =
            perfil.nome ||
            profissional.email ||
            "Profissional";

        const label = criar("label", "opcao-profissional");

        label.classList.toggle(
            "selecionada",
            selecionados.has(profissional.id)
        );

        const check = criar("input", "check-profissional");

        check.type = "checkbox";
        check.value = String(profissional.id);
        check.checked = selecionados.has(profissional.id);
        check.setAttribute("aria-label", `Selecionar ${nome}`);

        const img = criar("img", "foto-opcao");

        img.alt = "";
        img.width = 48;
        img.height = 48;

        void window.Oficina.imagem(
            img,
            perfil.urlFotoPerfil || profissional.urlFotoPerfil
        );

        const dados = criar("span", "dados-opcao");

        dados.append(
            criar("strong", "nome-opcao", nome),

            criar(
                "span",
                "ocupacao-opcao",
                perfil.ocupacao || "Profissional"
            )
        );

        if (profissional.email) {
          dados.append(
              criar(
                  "span",
                  "email-opcao",
                  profissional.email
              )
          );
        }

        const status = criar(
            "span",
            "status-opcao",
            check.checked ? "Selecionado" : "Selecionar"
        );

        check.addEventListener("change", () => {
          if (enviando || pacienteSalvo()) {
            return;
          }

          if (check.checked) {
            selecionados.set(profissional.id, profissional);
          } else {
            selecionados.delete(profissional.id);
          }

          label.classList.toggle(
              "selecionada",
              check.checked
          );

          status.textContent = check.checked
              ? "Selecionado"
              : "Selecionar";

          sincronizar();
        });

        label.append(check, img, dados, status);
        lista.append(label);
      });

      sincronizar();
    }

    async function carregarResultados() {
      if (!pronto || enviando) {
        return;
      }

      clearTimeout(timer);

      const pedido = ++sequencia;

      buscando = true;
      erroBusca = false;

      mensagem();
      renderizar();

      try {
        const termo = encodeURIComponent(busca.value.trim());

        const encontrados = await window.Oficina.get(
            `/usuario/buscar?nome=${termo}`
        );

        if (pedido !== sequencia) {
          return;
        }

        if (!Array.isArray(encontrados)) {
          throw new Error(
              "O servidor não retornou uma lista válida de profissionais."
          );
        }

        const unicos = new Map();

        encontrados.forEach((item) => {
          const id = Number(item?.id);

          if (
              !Number.isSafeInteger(id) ||
              id <= 0 ||
              id === Number(usuario.id)
          ) {
            return;
          }

          if (
              item.tipoUsuario &&
              item.tipoUsuario !== "PROFISSIONAL"
          ) {
            return;
          }

          if (!cadastro && existentes.has(id)) {
            return;
          }

          unicos.set(id, { ...item, id });
        });

        resultados = [...unicos.values()];
      } catch (erro) {
        if (pedido !== sequencia) {
          return;
        }

        resultados = [];
        erroBusca = true;

        mensagem(
            erro.message || "Não foi possível pesquisar profissionais."
        );
      } finally {
        if (pedido === sequencia) {
          buscando = false;
          renderizar();
        }
      }
    }

    async function carregarPagina() {
      if (iniciando || enviando || buscando) {
        return;
      }

      clearTimeout(timer);

      iniciando = true;
      pronto = false;
      resultados = [];

      mensagem("Carregando informações…", "info");
      renderizar();

      try {
        usuario = await window.Oficina.exigirSessao();

        if (usuario.tipoUsuario !== "PROFISSIONAL") {
          throw new Error(
              "Esta página está disponível para profissionais."
          );
        }

        if (cadastro) {
          if (!dadosCadastro) {
            try {
              dadosCadastro = JSON.parse(
                  sessionStorage.getItem(CHAVE)
              );
            } catch {
              dadosCadastro = null;
            }
          }

          if (!dadosCadastro?.nome) {
            window.location.replace("criar_paciente.html");
            return;
          }

          elemento("cadastro-nota").hidden = false;

          elemento("cadastro-nota").textContent = pacienteSalvo()
              ? "O paciente já foi salvo. Conclua esta etapa para finalizar o cadastro e o envio da foto."
              : `Etapa final do cadastro de ${dadosCadastro.nome}. Você pode escolher profissionais ou concluir sem convites.`;

          elemento("voltar-profissionais").href =
              "descreve_paciente.html";

          elemento("voltar-profissionais").textContent =
              "Voltar às informações";
        } else {
          const relacoes = await window.Oficina.get(
              "/usuario-aluno?tipoRelacao=PROFISSIONAL_PROFISSIONAL"
          );

          if (!Array.isArray(relacoes)) {
            throw new Error(
                "Não foi possível consultar os vínculos existentes."
            );
          }

          existentes.clear();

          relacoes.forEach((relacao) => {
            const outro =
                Number(relacao.usuarioSolicitante?.id) ===
                Number(usuario.id)
                    ? relacao.usuarioDestinatario
                    : relacao.usuarioSolicitante;

            const id = Number(outro?.id);

            if (Number.isSafeInteger(id) && id > 0) {
              existentes.add(id);
            }
          });

          existentes.forEach((id) => {
            selecionados.delete(id);
          });
        }

        pronto = true;
        mensagem();
      } catch (erro) {
        mensagem(
            erro.message || "Não foi possível carregar esta página."
        );
      } finally {
        iniciando = false;
        renderizar();
      }

      if (pronto) {
        await carregarResultados();
      }
    }

    async function concluirCadastro() {
      const dados = dadosCadastro;

      if (!dados?.nome) {
        throw new Error(
            "Retorne ao cadastro e preencha os dados do paciente."
        );
      }

      if (!dados.salvoId) {
        const paciente = await window.Oficina.post(
            "/paciente/criar",
            {
              email: dados.email,

              perfilUsuario: {
                nome: dados.nome,
                telefone: dados.celular,
                dataNascimento: dados.dataNascimento,
                condicoes: dados.condicoes,
                conteudoHtml: window.Oficina.textoHTML(
                    dados.problemas
                )
              },

              profissionais: [...selecionados.keys()]
            }
        );

        const id = Number(paciente?.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error(
              "O servidor não retornou o identificador do paciente."
          );
        }

        dados.salvoId = id;
        selecionados.clear();

        sessionStorage.setItem(
            CHAVE,
            JSON.stringify(dados)
        );
      }

      if (dados.foto) {
        try {
          const resposta = await fetch(dados.foto);

          if (!resposta.ok) {
            throw new Error(
                "Não foi possível ler a foto selecionada."
            );
          }

          const blob = await resposta.blob();

          const arquivo = new File(
              [blob],
              dados.fotoNome || "foto.png",
              { type: blob.type }
          );

          await window.Oficina.foto(
              dados.salvoId,
              arquivo
          );
        } catch (erro) {
          throw new Error(
              `Paciente salvo. Não foi possível enviar a foto: ${erro.message} Clique em Concluir cadastro para tentar novamente.`
          );
        }
      }

      sessionStorage.removeItem(CHAVE);

      window.location.href =
          `metas.html?paciente=${encodeURIComponent(dados.salvoId)}`;
    }

    salvar.addEventListener("click", async () => {
      if (
          !pronto ||
          iniciando ||
          buscando ||
          enviando ||
          (!cadastro && selecionados.size === 0)
      ) {
        return;
      }

      clearTimeout(timer);
      ++sequencia;

      buscando = false;
      enviando = true;

      mensagem();
      sincronizar();

      let enviados = 0;

      try {
        if (cadastro) {
          await concluirCadastro();
        } else {
          for (const id of [...selecionados.keys()]) {
            await window.Oficina.post(
                "/usuario-aluno/criar",
                {
                  usuarioDestinatario: { id }
                }
            );

            selecionados.delete(id);
            existentes.add(id);

            resultados = resultados.filter((item) => {
              return item.id !== id;
            });

            enviados++;
            renderizar();
          }

          window.location.href = "Profissionais.html";
        }
      } catch (erro) {
        const detalhe =
            erro.message || "Não foi possível concluir a operação.";

        mensagem(
            enviados > 0
                ? `${enviados} ${
                    enviados === 1
                        ? "solicitação enviada"
                        : "solicitações enviadas"
                }. ${detalhe} Tente enviar as restantes novamente.`
                : detalhe
        );
      } finally {
        enviando = false;
        renderizar();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void carregarResultados();
    });

    busca.addEventListener("input", () => {
      clearTimeout(timer);
      ++sequencia;

      buscando = false;
      sincronizar();

      timer = setTimeout(() => {
        void carregarResultados();
      }, 300);
    });

    limpar.addEventListener("click", () => {
      if (enviando || pacienteSalvo()) {
        return;
      }

      selecionados.clear();
      renderizar();
    });

    atualizar.addEventListener("click", () => {
      void carregarPagina();
    });

    void carregarPagina();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarPagina,
        { once: true }
    );
  } else {
    iniciarPagina();
  }
})();