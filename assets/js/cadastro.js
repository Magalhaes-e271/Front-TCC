(() => {
  "use strict";

  function iniciarCadastro() {
    const elemento = (id) => document.getElementById(id);
    const formulario = elemento("form-cadastro");

    if (!formulario || formulario.dataset.cadastroInicializado === "true") {
      return;
    }

    formulario.dataset.cadastroInicializado = "true";
    formulario.noValidate = true;

    const config = window.OFICINA_CONFIG || {};
    const API = String(config.apiBase || "http://localhost:8080")
        .replace(/\/+$/, "");

    const timeout = Number(config.timeoutMs) > 0
        ? Number(config.timeoutMs)
        : 20000;

    const CHAVE_SESSAO = "oficina.sessao";
    const FOTO_PADRAO = "../assets/icons/user-icon.png";
    const MAX_FOTO = 10 * 1024 * 1024;

    const partes = [...formulario.querySelectorAll(".parte")];
    const indicadores = [...document.querySelectorAll(".etapas li")];
    const campos = [...formulario.querySelectorAll("input, textarea, select")];

    const botaoEnviar = elemento("btn-cadastrar");
    const botaoAnterior = elemento("btn-anterior");
    const avisoPagina = elemento("pagina-erro");
    const campoFoto = elemento("foto");
    const imagemFoto = elemento("photoPreview");
    const botaoRemoverFoto = elemento("remover-foto");

    const editando = new URLSearchParams(location.search).has("editar");
    const nomesEtapas = [
      "Dados pessoais",
      "Perfil profissional",
      "Revisão"
    ];

    const camposBloqueados = new Set(["formacao"]);

    let etapa = 0;
    let pronto = !editando;
    let ocupado = false;
    let salvo = false;
    let usuario = null;
    let sessao = lerSessao();
    let previewUrl = null;
    let fotoAtualUrl = null;

    if (editando) {
      [
        "senha",
        "confirm-senha",
        "foto",
        "horarioTrabalho",
        "horarioDeSaida",
        "condicao"
      ].forEach((id) => camposBloqueados.add(id));
    }

    function lerSessao() {
      try {
        return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null;
      } catch {
        return null;
      }
    }

    function mostrarMensagem(texto = "", tipo = "erro") {
      avisoPagina.textContent = texto;
      avisoPagina.hidden = !texto;
      avisoPagina.dataset.tipo = tipo;
      avisoPagina.setAttribute(
          "role",
          tipo === "erro" ? "alert" : "status"
      );

      if (texto) avisoPagina.focus();
    }

    function mensagemServidor(conteudo, status) {
      if (
          typeof conteudo === "string" &&
          conteudo.trim() &&
          !/^\s*</.test(conteudo)
      ) {
        return conteudo.trim();
      }

      const mensagem = conteudo?.detail || conteudo?.message;

      if (typeof mensagem === "string" && mensagem.trim()) {
        return mensagem;
      }

      const mensagens = {
        400: "Confira os dados preenchidos e a foto selecionada.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "O servidor não autorizou esta operação.",
        409: "Já existe uma conta com este e-mail.",
        413: "A foto excede o tamanho permitido pelo servidor.",
        415: "O servidor não aceitou o formato enviado."
      };

      return mensagens[status] ||
          `Não foi possível concluir a operação. HTTP ${status}.`;
    }

    async function requisicao(rota, {
      method = "GET",
      dados,
      autenticada = false,
      arquivo = false,
      aoConfirmar
    } = {}) {
      const headers = new Headers({
        Accept: arquivo ? "image/*" : "application/json"
      });

      if (autenticada) {
        if (!sessao?.token) {
          const erro = new Error("Faça login para continuar.");
          erro.status = 401;
          throw erro;
        }

        headers.set("Authorization", `Bearer ${sessao.token}`);
      }

      let body;

      if (dados instanceof FormData) {
        body = dados;

        // O navegador gera o Content-Type multipart com o boundary.
        headers.delete("Content-Type");
      } else if (dados !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(dados);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(`${API}${rota}`, {
          method,
          headers,
          body,
          signal: controller.signal
        });

        // Evita repetir uma operação já confirmada pelo servidor.
        if (response.ok) aoConfirmar?.();

        if (response.ok && arquivo) {
          return await response.blob();
        }

        const texto = await response.text();
        let conteudo = null;
        let jsonValido = true;

        if (texto.trim()) {
          try {
            conteudo = JSON.parse(texto);
          } catch {
            conteudo = texto;
            jsonValido = false;
          }
        }

        if (!response.ok) {
          const erro = new Error(
              mensagemServidor(conteudo, response.status)
          );

          erro.status = response.status;
          throw erro;
        }

        if (!jsonValido) {
          throw new Error(
              "O servidor confirmou a operação, mas não retornou um JSON válido."
          );
        }

        return conteudo;
      } catch (erro) {
        if (erro.name === "AbortError") {
          const falha = new Error("O servidor demorou para responder.");
          falha.resultadoIncerto = true;
          throw falha;
        }

        if (erro instanceof TypeError) {
          const falha = new Error(
              "Não foi possível receber a resposta do servidor. " +
              "Verifique sua conexão e se a API está funcionando."
          );

          falha.resultadoIncerto = true;
          throw falha;
        }

        throw erro;
      } finally {
        clearTimeout(timer);
      }
    }

    const digitos = (valor) =>
        String(valor || "").replace(/\D/g, "");

    function formatarCPF(valor) {
      return digitos(valor)
          .slice(0, 11)
          .replace(/^(\d{3})(\d)/, "$1.$2")
          .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
          .replace(/\.(\d{3})(\d)/, ".$1-$2");
    }

    function formatarCelular(valor) {
      return digitos(valor)
          .slice(0, 11)
          .replace(/^(\d{2})(\d)/, "($1) $2")
          .replace(/(\d{5})(\d{4})$/, "$1-$2");
    }

    function cpfValido(valor) {
      const cpf = digitos(valor);

      if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
        return false;
      }

      return [9, 10].every((tamanho) => {
        let soma = 0;

        for (let i = 0; i < tamanho; i++) {
          soma += Number(cpf[i]) * (tamanho + 1 - i);
        }

        const resto = (soma * 10) % 11;

        return Number(cpf[tamanho]) === (resto === 10 ? 0 : resto);
      });
    }

    function erroCampo(campo, mensagem = "") {
      const aviso = elemento(`erro-${campo.id}`);

      if (aviso) aviso.textContent = mensagem;

      if (mensagem) {
        campo.setAttribute("aria-invalid", "true");
      } else {
        campo.removeAttribute("aria-invalid");
      }

      return !mensagem;
    }

    function validarCampo(campo) {
      if (campo.disabled) return true;

      const ehSenha = ["senha", "confirm-senha"].includes(campo.id);
      const valor = ehSenha ? campo.value : campo.value.trim();

      let mensagem = "";

      if (campo.type === "file") {
        const foto = campo.files[0];

        if (campo.required && !foto) {
          mensagem = "Selecione uma foto para concluir o cadastro.";
        } else if (foto) {
          if (!["image/png", "image/jpeg", "image/gif"].includes(foto.type)) {
            mensagem = "Selecione uma foto PNG, JPEG ou GIF.";
          } else if (!foto.size || foto.size > MAX_FOTO) {
            mensagem = "A foto deve conter dados e ter até 10 MB.";
          }
        }

        return erroCampo(campo, mensagem);
      }

      if (campo.type === "checkbox") {
        if (campo.required && !campo.checked) {
          mensagem = "Confira e confirme suas informações.";
        }

        return erroCampo(campo, mensagem);
      }

      if (campo.required && !valor) {
        mensagem = "Preencha este campo.";
      } else if (!valor && !campo.required) {
        return erroCampo(campo);
      } else if (campo.maxLength > 0 && valor.length > campo.maxLength) {
        mensagem = `Use no máximo ${campo.maxLength} caracteres.`;
      } else if (
          campo.id === "email" &&
          (
              !campo.validity.valid ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
          )
      ) {
        mensagem = "Informe um e-mail válido.";
      } else if (campo.id === "cpf" && !cpfValido(valor)) {
        mensagem = "Informe um CPF válido.";
      } else if (
          campo.id === "celular" &&
          !/^[1-9]{2}9\d{8}$/.test(digitos(valor))
      ) {
        mensagem = "Informe o DDD e os 9 dígitos do celular.";
      } else if (
          campo.id === "dataNascimento" &&
          (
              !campo.validity.valid ||
              valor < "1900-01-01" ||
              valor > campo.max
          )
      ) {
        mensagem = "Informe uma data válida, que não esteja no futuro.";
      } else if (
          campo.id === "senha" &&
          (
              valor.length < 8 ||
              !/[A-Z]/.test(valor) ||
              !/[a-z]/.test(valor) ||
              !/\d/.test(valor) ||
              !/[^A-Za-z0-9]/.test(valor)
          )
      ) {
        mensagem =
            "Use ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo.";
      } else if (
          campo.id === "senha" &&
          new TextEncoder().encode(valor).length > 72
      ) {
        mensagem = "A senha deve ter no máximo 72 bytes.";
      } else if (
          campo.id === "confirm-senha" &&
          valor !== elemento("senha").value
      ) {
        mensagem = "As senhas não coincidem.";
      } else if (
          campo.id === "descricao" &&
          valor.length < 10
      ) {
        mensagem = "Escreva uma descrição com pelo menos 10 caracteres.";
      } else if (!campo.validity.valid) {
        mensagem = "Confira o valor deste campo.";
      }

      return erroCampo(campo, mensagem);
    }

    function validarParte(indice) {
      let primeiroErro = null;

      partes[indice]
          .querySelectorAll("input, textarea, select")
          .forEach((campo) => {
            if (!validarCampo(campo) && !primeiroErro) {
              primeiroErro = campo;
            }
          });

      if (!primeiroErro) return true;

      mostrarParte(indice, false);
      primeiroErro.focus();

      return false;
    }

    function atualizarForca() {
      const senha = elemento("senha").value;
      const nivel = [
        senha.length >= 8,
        /[A-Z]/.test(senha),
        /[a-z]/.test(senha),
        /\d/.test(senha),
        /[^A-Za-z0-9]/.test(senha)
      ].filter(Boolean).length;

      const barra = document.querySelector(".progresso");
      const texto = document.querySelector(".texto-forca");

      if (barra) {
        barra.style.width = senha ? `${nivel * 20}%` : "0%";
      }

      if (texto) {
        const niveis = [
          "Muito fraca",
          "Muito fraca",
          "Fraca",
          "Média",
          "Forte",
          "Muito forte"
        ];

        texto.textContent = senha ? niveis[nivel] : "Digite uma senha";
      }
    }

    function configurarToggle(botaoId, campoId) {
      const botao = elemento(botaoId);
      const campo = elemento(campoId);

      if (!botao || !campo) return;

      botao.setAttribute("aria-label", "Mostrar senha");

      botao.addEventListener("click", () => {
        campo.type = campo.type === "password" ? "text" : "password";

        botao.setAttribute(
            "aria-label",
            campo.type === "password" ? "Mostrar senha" : "Ocultar senha"
        );
      });
    }

    function sincronizarControles() {
      campos.forEach((campo) => {
        campo.disabled =
            !pronto || ocupado || salvo || camposBloqueados.has(campo.id);
      });

      formulario
          .querySelectorAll(".toggle-senha, #remover-foto")
          .forEach((botao) => {
            botao.disabled = !pronto || ocupado || salvo || editando;
          });

      formulario.setAttribute("aria-busy", String(!pronto || ocupado));

      botaoAnterior.disabled = !pronto || ocupado || salvo;
      botaoEnviar.disabled = !pronto || ocupado;

      if (ocupado) {
        botaoEnviar.textContent = editando
            ? "Salvando perfil…"
            : "Enviando cadastro…";
      } else if (!pronto) {
        botaoEnviar.textContent = "Carregando perfil…";
      } else if (salvo) {
        botaoEnviar.textContent = editando ? "Continuar" : "Entrar";
      } else if (etapa < partes.length - 1) {
        botaoEnviar.textContent = "Continuar →";
      } else {
        botaoEnviar.textContent = editando ? "Salvar perfil" : "Criar conta";
      }
    }

    function preencherResumo(id, linhas) {
      const lista = elemento(id);
      lista.replaceChildren();

      linhas.forEach(([titulo, valor]) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");

        dt.textContent = titulo;

        if (valor instanceof Node) {
          dd.append(valor);
        } else {
          dd.textContent = valor || "Não informado";
        }

        lista.append(dt, dd);
      });
    }

    function atualizarResumo() {
      preencherResumo("resumo-pessoal", [
        ["Nome", elemento("nome").value.trim()],
        ["E-mail", elemento("email").value.trim()],
        ["CPF", formatarCPF(elemento("cpf").value)],
        ["Celular", formatarCelular(elemento("celular").value)],
        [
          "Nascimento",
          elemento("dataNascimento").value.split("-").reverse().join("/")
        ]
      ]);

      const linhas = [
        ["Ocupação", elemento("ocupacao").value.trim()],
        ["Instituição", elemento("instituicao").value.trim()],
        ["Horário de entrada", elemento("horarioTrabalho").value],
        ["Horário de saída", elemento("horarioDeSaida").value],
        ["Descrição", elemento("descricao").value.trim()]
      ];

      if (elemento("condicao")) {
        linhas.push([
          "Condição",
          elemento("condicao").value.trim()
        ]);
      }

      if (campoFoto.files[0] || usuario?.perfil?.urlFotoPerfil) {
        const fotoResumo = document.createElement("img");

        fotoResumo.src = imagemFoto.src;
        fotoResumo.alt = "Foto do perfil";
        fotoResumo.width = 80;
        fotoResumo.height = 80;
        fotoResumo.style.borderRadius = "50%";
        fotoResumo.style.objectFit = "cover";

        linhas.push(["Foto", fotoResumo]);
      } else {
        linhas.push(["Foto", "Nenhuma foto selecionada"]);
      }

      preencherResumo("resumo-profissional", linhas);
    }

    function mostrarParte(indice, focar = true) {
      etapa = indice;

      partes.forEach((parte, i) => {
        const ativa = i === indice;

        parte.hidden = !ativa;
        parte.style.display = ativa ? "" : "none";
        parte.classList.toggle("ativa", ativa);

        const indicador = indicadores[i];

        if (indicador) {
          indicador.classList.toggle("concluida", i < indice);

          if (ativa) {
            indicador.setAttribute("aria-current", "step");
          } else {
            indicador.removeAttribute("aria-current");
          }
        }
      });

      elemento("contador").textContent =
          `Etapa ${indice + 1} de ${partes.length}`;

      elemento("progresso-etapa").textContent =
          `Etapa ${indice + 1} de ${partes.length}: ${nomesEtapas[indice]}`;

      botaoAnterior.hidden = indice === 0;

      if (indice === partes.length - 1) {
        atualizarResumo();
      }

      sincronizarControles();

      if (focar) {
        partes[indice].querySelector("h2")?.focus();
      }
    }

    function horarioParaServidor(valor) {
      if (!valor) return null;

      return valor.length === 5 ? `${valor}:00` : valor;
    }

    function descricaoParaHtml(texto) {
      const escapar = (valor) =>
          valor
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");

      return texto
          .trim()
          .split(/\n\s*\n/)
          .map((paragrafo) =>
              `<p>${escapar(paragrafo).replace(/\n/g, "<br>")}</p>`
          )
          .join("");
    }

    function htmlParaDescricao(html) {
      const doc = new DOMParser().parseFromString(
          String(html || ""),
          "text/html"
      );

      doc
          .querySelectorAll("script, style, iframe, object, embed")
          .forEach((item) => item.remove());

      doc.querySelectorAll("br").forEach((item) => {
        item.replaceWith(doc.createTextNode("\n"));
      });

      doc
          .querySelectorAll("p, div, h1, h2, h3, h4, li, blockquote")
          .forEach((item) => {
            item.append(doc.createTextNode("\n\n"));
          });

      return (doc.body.textContent || "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
    }

    function dadosPerfil() {
      const perfil = {
        nome: elemento("nome").value.trim(),
        telefone: digitos(elemento("celular").value),
        cpf: digitos(elemento("cpf").value),
        dataNascimento: elemento("dataNascimento").value,
        ocupacao: elemento("ocupacao").value.trim(),
        instituicao: elemento("instituicao").value.trim(),
        conteudoHtml: descricaoParaHtml(
            elemento("descricao").value
        )
      };

      if (!editando) {
        perfil.horarioDeEntrada = horarioParaServidor(
            elemento("horarioTrabalho").value
        );

        perfil.horarioDeSaida = horarioParaServidor(
            elemento("horarioDeSaida").value
        );

        if (elemento("condicao")) {
          perfil.condicao =
              elemento("condicao").value.trim() || null;
        }
      }

      return perfil;
    }

    function preencherDados(dadosUsuario) {
      const perfil = dadosUsuario.perfil || {};

      ["nome", "ocupacao", "instituicao"].forEach((id) => {
        elemento(id).value = perfil[id] || "";
      });

      elemento("email").value = dadosUsuario.email || "";
      elemento("cpf").value = formatarCPF(perfil.cpf);
      elemento("celular").value = formatarCelular(perfil.telefone);

      elemento("dataNascimento").value =
          String(perfil.dataNascimento || "").slice(0, 10);

      elemento("horarioTrabalho").value =
          String(perfil.horarioDeEntrada || "").slice(0, 5);

      elemento("horarioDeSaida").value =
          String(perfil.horarioDeSaida || "").slice(0, 5);

      elemento("descricao").value = htmlParaDescricao(
          perfil.conteudoHtml
      );

      if (elemento("condicao")) {
        elemento("condicao").value = perfil.condicao || "";
      }
    }

    function marcarSalvo() {
      salvo = true;

      elemento("senha").value = "";
      elemento("confirm-senha").value = "";

      atualizarForca();
    }

    function restaurarFoto() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }

      imagemFoto.src = fotoAtualUrl || FOTO_PADRAO;
    }

    async function carregarFotoAtual() {
      if (!usuario?.perfil?.urlFotoPerfil) return;

      try {
        const arquivo = await requisicao(
            `/usuario/foto?id=${encodeURIComponent(usuario.id)}`,
            {
              autenticada: true,
              arquivo: true
            }
        );

        if (fotoAtualUrl) {
          URL.revokeObjectURL(fotoAtualUrl);
        }

        fotoAtualUrl = URL.createObjectURL(arquivo);
        restaurarFoto();
      } catch {
        imagemFoto.src = FOTO_PADRAO;
      } finally {
        if (etapa === partes.length - 1) {
          atualizarResumo();
        }
      }
    }

    async function enviar() {
      if (!pronto || ocupado || salvo) return;

      ocupado = true;

      mostrarMensagem();
      sincronizarControles();

      try {
        if (editando) {
          const perfil = await requisicao(
              `/usuario/descricao?id=${encodeURIComponent(usuario.id)}`,
              {
                method: "PUT",
                autenticada: true,
                dados: dadosPerfil(),
                aoConfirmar: marcarSalvo
              }
          );

          if (!perfil || String(perfil.id) !== String(usuario.id)) {
            throw new Error(
                "O servidor não retornou o perfil esperado."
            );
          }

          usuario = { ...usuario, perfil };

          if (sessao) {
            sessao.usuario = usuario;

            try {
              localStorage.setItem(
                  CHAVE_SESSAO,
                  JSON.stringify(sessao)
              );
            } catch {
              // O perfil já foi atualizado no servidor.
            }
          }

          preencherDados(usuario);
          atualizarResumo();

          mostrarMensagem(
              "Seu perfil foi atualizado com sucesso. Clique em Continuar.",
              "sucesso"
          );

          return;
        }

        const email = elemento("email").value.trim().toLowerCase();
        const foto = campoFoto.files[0];

        if (!foto) {
          throw new Error(
              "Selecione uma foto para concluir o cadastro."
          );
        }

        const dados = {
          email,
          senha: elemento("senha").value,
          tipoUsuario: "PROFISSIONAL",
          perfilUsuario: dadosPerfil()
        };

        const multipart = new FormData();

        multipart.append(
            "dados",
            new Blob(
                [JSON.stringify(dados)],
                { type: "application/json" }
            )
        );

        multipart.append("foto", foto, foto.name);

        const resposta = await requisicao("/usuario/criar", {
          method: "POST",
          dados: multipart,
          aoConfirmar: marcarSalvo
        });

        const usuarioCriado = resposta?.usuario;

        if (
            typeof resposta?.token !== "string" ||
            !resposta.token.trim() ||
            !usuarioCriado ||
            !Number.isSafeInteger(usuarioCriado.id) ||
            usuarioCriado.id <= 0 ||
            typeof usuarioCriado.email !== "string" ||
            usuarioCriado.email.trim().toLowerCase() !== email ||
            !usuarioCriado.perfil ||
            typeof usuarioCriado.perfil.urlFotoPerfil !== "string" ||
            !usuarioCriado.perfil.urlFotoPerfil.trim()
        ) {
          throw new Error(
              "O servidor não retornou uma sessão válida para a conta criada."
          );
        }

        const novaSessao = {
          token: resposta.token.trim(),
          usuario: usuarioCriado
        };

        window.Oficina?.sair(false);

        localStorage.setItem(
            CHAVE_SESSAO,
            JSON.stringify(novaSessao)
        );

        sessao = novaSessao;
        usuario = usuarioCriado;

        mostrarMensagem(
            "Conta criada com sucesso! Entrando…",
            "sucesso"
        );

        location.replace("dashboard.html");
      } catch (erro) {
        let mensagem = erro.message || "Não foi possível concluir o envio.";

        if (salvo) {
          mensagem = editando
              ? "O servidor confirmou a atualização do perfil. " +
              mensagem +
              " Clique em Continuar para conferir."
              : "Sua conta já foi criada, mas não foi possível concluir " +
              "a entrada automática. " +
              mensagem +
              " Clique em Entrar para acessar sua conta.";
        } else if (!editando && erro.resultadoIncerto) {
          mensagem +=
              " O envio pode ter sido processado. Confira se já consegue " +
              "entrar antes de enviar novamente.";
        }

        mostrarMensagem(mensagem);
      } finally {
        ocupado = false;
        sincronizarControles();
      }
    }

    formulario.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!pronto || ocupado) return;

      if (salvo) {
        location.href = editando
            ? "dashboard.html"
            : "login.html?cadastro=sucesso";

        return;
      }

      mostrarMensagem();

      if (!validarParte(etapa)) return;

      if (etapa < partes.length - 1) {
        mostrarParte(etapa + 1);
        return;
      }

      for (let i = 0; i < partes.length; i++) {
        if (!validarParte(i)) return;
      }

      void enviar();
    });

    botaoAnterior.addEventListener("click", () => {
      if (!pronto || ocupado || salvo || etapa === 0) return;

      mostrarMensagem();
      mostrarParte(etapa - 1);
    });

    campos.forEach((campo) => {
      const revisar = () => {
        if (campo.hasAttribute("aria-invalid")) {
          validarCampo(campo);
        }

        if (campo.id !== "conferido") {
          elemento("conferido").checked = false;
        }
      };

      campo.addEventListener("input", revisar);
      campo.addEventListener("change", revisar);
    });

    elemento("cpf").addEventListener("input", (event) => {
      event.target.value = formatarCPF(event.target.value);
    });

    elemento("celular").addEventListener("input", (event) => {
      event.target.value = formatarCelular(event.target.value);
    });

    elemento("senha").addEventListener("input", () => {
      atualizarForca();

      if (elemento("confirm-senha").value) {
        validarCampo(elemento("confirm-senha"));
      }
    });

    configurarToggle("toggle-senha", "senha");
    configurarToggle("toggle-confirm-senha", "confirm-senha");

    campoFoto.addEventListener("change", () => {
      const foto = campoFoto.files[0];

      elemento("conferido").checked = false;
      botaoRemoverFoto.hidden = !foto;

      restaurarFoto();

      if (!validarCampo(campoFoto) || !foto) return;

      previewUrl = URL.createObjectURL(foto);
      imagemFoto.src = previewUrl;
    });

    botaoRemoverFoto.addEventListener("click", () => {
      if (ocupado || salvo || editando) return;

      campoFoto.value = "";
      elemento("conferido").checked = false;
      botaoRemoverFoto.hidden = true;

      erroCampo(campoFoto);
      restaurarFoto();
    });

    const hoje = new Date();

    elemento("dataNascimento").max =
        `${hoje.getFullYear()}-` +
        `${String(hoje.getMonth() + 1).padStart(2, "0")}-` +
        `${String(hoje.getDate()).padStart(2, "0")}`;

    elemento("descricao").required = true;
    elemento("descricao").minLength = 10;
    elemento("horarioTrabalho").required = !editando;
    elemento("horarioDeSaida").required = !editando;

    campoFoto.required = !editando;
    campoFoto.accept = "image/png,image/jpeg,image/gif";

    const labelFoto = document.querySelector('label[for="foto"]');

    if (labelFoto) {
      labelFoto.textContent = editando
          ? "Foto atual do perfil"
          : "Foto de perfil *";
    }

    elemento("foto-ajuda").textContent = editando
        ? "A troca de foto não está disponível nesta edição."
        : "Foto obrigatória. PNG, JPEG ou GIF, até 10 MB.";

    elemento("concluir-sem-foto")?.remove();

    const campoFormacao = elemento("formacao");

    if (campoFormacao) {
      campoFormacao.required = false;
      campoFormacao.disabled = true;

      const container = campoFormacao.closest(".campo");

      if (container) {
        container.hidden = true;
        container.style.display = "none";
      }
    }

    if (editando) {
      document.title = "Editar perfil | OficinaAprender+";

      elemento("sobretitulo").textContent = "SEU PERFIL";
      elemento("titulo-pagina").textContent = "Atualize suas informações";

      elemento("subtitulo-pagina").textContent =
          "Seus dados pessoais, profissionais e descrição no mesmo formulário.";

      elemento("btn-voltar").href = "dashboard.html";
      elemento("btn-voltar").setAttribute(
          "aria-label",
          "Voltar ao painel"
      );

      document.querySelectorAll(".acesso").forEach((bloco) => {
        bloco.hidden = true;
        bloco.style.display = "none";
      });

      ["senha", "confirm-senha"].forEach((id) => {
        elemento(id).required = false;
      });

      elemento("email").readOnly = true;

      elemento("nota-edicao").hidden = false;
      elemento("nota-edicao").textContent =
          "Atualize seus dados e descrição. " +
          "E-mail, horários e foto ficam disponíveis apenas para consulta.";

      elemento("rodape-cadastro").hidden = true;
      elemento("nota-envio").textContent =
          "Ao concluir, suas informações e descrição serão atualizadas no servidor.";

      void (async () => {
        try {
          if (!sessao?.token || !sessao.usuario?.email) {
            location.replace("login.html");
            return;
          }

          usuario = await requisicao(
              `/usuario/email?email=${encodeURIComponent(sessao.usuario.email)}`,
              { autenticada: true }
          );

          if (
              !usuario ||
              !usuario.id ||
              !usuario.perfil ||
              String(usuario.email).toLowerCase() !==
              String(sessao.usuario.email).toLowerCase()
          ) {
            throw new Error(
                "O servidor não retornou seu perfil corretamente."
            );
          }

          preencherDados(usuario);

          pronto = true;
          sincronizarControles();

          await carregarFotoAtual();
        } catch (erro) {
          if (erro.status === 401) {
            try {
              window.Oficina?.sair(false);
              localStorage.removeItem(CHAVE_SESSAO);
            } catch {
              // Continua para a página de login.
            }

            location.replace("login.html");
            return;
          }

          mostrarMensagem(
              `${erro.message} Recarregue a página para tentar novamente.`
          );

          botaoEnviar.textContent = "Perfil indisponível";
        }
      })();
    }

    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      if (fotoAtualUrl) {
        URL.revokeObjectURL(fotoAtualUrl);
      }
    });

    atualizarForca();
    mostrarParte(0, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarCadastro, {
      once: true
    });
  } else {
    iniciarCadastro();
  }
})();