(() => {
  "use strict";

  function iniciarLogin() {
    const form = document.getElementById("form-login");

    if (!form || form.dataset.inicializado === "true") {
      return;
    }

    form.dataset.inicializado = "true";

    const email = document.getElementById("email");
    const senha = document.getElementById("senha");
    const botao = document.getElementById("btn-entrar");
    const textoBotao = document.getElementById("texto-entrar");
    const toggle = document.getElementById("toggle-senha");
    const mensagem = document.getElementById("login-mensagem");
    const capsLock = document.getElementById("aviso-capslock");
    const config = window.OFICINA_CONFIG;

    let enviando = false;

    function mostrarMensagem(texto = "") {
      mensagem.textContent = texto;
      mensagem.hidden = !texto;
    }

    function atualizarEnvio(ativo) {
      enviando = ativo;

      botao.disabled = ativo;
      email.readOnly = ativo;
      senha.readOnly = ativo;

      form.setAttribute("aria-busy", String(ativo));

      textoBotao.textContent = ativo
          ? "Entrando…"
          : "Entrar na minha conta";
    }

    toggle.addEventListener("click", () => {
      const mostrar = senha.type === "password";

      senha.type = mostrar ? "text" : "password";

      const rotulo = mostrar
          ? "Ocultar senha"
          : "Mostrar senha";

      toggle.setAttribute("aria-label", rotulo);
      toggle.setAttribute("aria-pressed", String(mostrar));
      toggle.title = rotulo;

      document.getElementById("olho-aberto").hidden = mostrar;
      document.getElementById("olho-fechado").hidden = !mostrar;
    });

    function verificarCapsLock(event) {
      if (typeof event.getModifierState === "function") {
        capsLock.hidden = !event.getModifierState("CapsLock");
      }
    }

    senha.addEventListener("keydown", verificarCapsLock);
    senha.addEventListener("keyup", verificarCapsLock);

    senha.addEventListener("blur", () => {
      capsLock.hidden = true;
    });

    form.addEventListener("input", () => {
      if (!enviando) {
        mostrarMensagem();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (enviando) {
        return;
      }

      email.value = email.value.trim();
      mostrarMensagem();

      if (!form.reportValidity()) {
        return;
      }

      if (
          !config ||
          typeof config.apiBase !== "string" ||
          !config.apiBase.trim()
      ) {
        mostrarMensagem(
            "Não foi possível iniciar o login. Verifique a configuração do site."
        );

        return;
      }

      const api = config.apiBase.trim().replace(/\/+$/, "");
      const prazo = Number(config.timeoutMs);

      const timeout = Number.isFinite(prazo) && prazo > 0
          ? prazo
          : 20000;

      const controller = new AbortController();

      const timer = setTimeout(() => {
        controller.abort();
      }, timeout);

      let conectado = false;

      atualizarEnvio(true);

      try {
        const resposta = await fetch(`${api}/login`, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },

          body: JSON.stringify({
            email: email.value,
            senha: senha.value
          }),

          signal: controller.signal
        });

        const texto = await resposta.text();
        let dados = null;

        try {
          dados = texto ? JSON.parse(texto) : null;
        } catch {
          dados = null;
        }

        if (!resposta.ok) {
          if (resposta.status === 401 || resposta.status === 403) {
            throw new Error("E-mail ou senha inválidos.");
          }

          if (resposta.status === 429) {
            throw new Error(
                "Muitas tentativas de login. Aguarde um pouco e tente novamente."
            );
          }

          if (resposta.status >= 500) {
            throw new Error(
                "O servidor está indisponível no momento. Tente novamente em instantes."
            );
          }

          const detalhe = dados?.message || dados?.detail;

          throw new Error(
              typeof detalhe === "string"
                  ? detalhe
                  : "Não foi possível entrar. Verifique seus dados e tente novamente."
          );
        }

        if (
            typeof dados?.token !== "string" ||
            !dados.token.trim() ||
            dados.token === "undefined" ||
            dados.token === "null" ||
            !Number.isSafeInteger(dados.usuario?.id) ||
            dados.usuario.id <= 0 ||
            typeof dados.usuario.email !== "string" ||
            !dados.usuario.email.trim()
        ) {
          throw new Error(
              "O servidor não retornou os dados necessários para entrar."
          );
        }

        const sessao = {
          token: dados.token.trim(),
          usuario: dados.usuario
        };

        try {
          localStorage.setItem(
              "oficina.sessao",
              JSON.stringify(sessao)
          );

          localStorage.removeItem("token");
          localStorage.removeItem("email");
          sessionStorage.removeItem("oficina.paciente");
        } catch {
          throw new Error(
              "Não foi possível salvar sua sessão. Permita o armazenamento deste site no navegador e tente novamente."
          );
        }

        conectado = true;

        window.location.replace("dashboard.html");
      } catch (erro) {
        if (erro.name === "AbortError") {
          mostrarMensagem(
              "O servidor demorou para responder. Tente novamente."
          );
        } else if (erro instanceof TypeError) {
          mostrarMensagem(
              "Não foi possível conectar ao servidor. Tente novamente em instantes."
          );
        } else {
          mostrarMensagem(
              erro.message || "Não foi possível entrar. Tente novamente."
          );
        }
      } finally {
        clearTimeout(timer);

        if (!conectado) {
          atualizarEnvio(false);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarLogin,
        { once: true }
    );
  } else {
    iniciarLogin();
  }
})();