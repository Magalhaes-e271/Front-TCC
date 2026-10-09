(() => {
    "use strict";

    const raiz = document.documentElement;

    if (raiz.dataset.temaInicializado === "true") {
        return;
    }

    raiz.dataset.temaInicializado = "true";

    const CHAVE = "oficina.tema";
    const sistema = window.matchMedia("(prefers-color-scheme: dark)");

    let preferencia = null;
    let botao = null;

    function validarTema(valor) {
        return valor === "claro" || valor === "escuro"
            ? valor
            : null;
    }

    try {
        preferencia = validarTema(localStorage.getItem(CHAVE));
    } catch {
        preferencia = null;
    }

    function aplicarTema() {
        const tema = preferencia ||
            (sistema.matches ? "escuro" : "claro");

        const escuro = tema === "escuro";

        raiz.dataset.tema = tema;
        raiz.style.colorScheme = escuro ? "dark" : "light";

        if (!botao) {
            return;
        }

        const rotulo = escuro
            ? "Ativar modo claro"
            : "Ativar modo escuro";

        botao.setAttribute("aria-label", rotulo);
        botao.setAttribute("aria-pressed", String(escuro));
        botao.title = rotulo;

        botao.querySelector(".btn-text").textContent = escuro
            ? "Modo claro"
            : "Modo escuro";

        botao
            .querySelector('[data-icone="lua"]')
            .toggleAttribute("hidden", escuro);

        botao
            .querySelector('[data-icone="sol"]')
            .toggleAttribute("hidden", !escuro);
    }

    function criarBotao() {
        botao = document.getElementById("btn-tema");

        if (!botao) {
            botao = document.createElement("button");
            botao.id = "btn-tema";
        }

        botao.type = "button";
        botao.classList.add("btn-tema");

        const navbar = document.querySelector(".nav-bar");

        if (navbar) {
            botao.classList.remove(
                "botao-icone",
                "btn-tema-flutuante"
            );

            botao.classList.add("btn-tema-navbar");

            const rodape = navbar.querySelector(".nav-footer");

            if (rodape) {
                rodape.classList.add("com-tema");
                rodape.prepend(botao);
            } else {
                navbar.append(botao);
            }
        } else {
            botao.classList.remove(
                "btn-tema-navbar",
                "btn-tema-flutuante"
            );

            botao.classList.add("botao-icone");

            const cabecalho = document.querySelector(
                ".card-header, .barra-superior"
            );

            if (cabecalho) {
                const selo = cabecalho.querySelector(".selo");

                if (selo && selo.parentElement === cabecalho) {
                    cabecalho.insertBefore(botao, selo);
                } else {
                    cabecalho.append(botao);
                }
            } else {
                botao.classList.add("btn-tema-flutuante");
                document.body.append(botao);
            }
        }

        botao.innerHTML = `
      <svg
        data-icone="lua"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"
        ></path>
      </svg>

      <svg
        data-icone="sol"
        viewBox="0 0 24 24"
        aria-hidden="true"
        hidden
      >
        <circle cx="12" cy="12" r="4"></circle>

        <path
          d="M12 2v2M12 20v2M2 12h2M20 12h2"
        ></path>

        <path
          d="M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
        ></path>
      </svg>

      <span class="btn-text">Modo escuro</span>
    `;

        botao.addEventListener("click", () => {
            preferencia = raiz.dataset.tema === "escuro"
                ? "claro"
                : "escuro";

            try {
                localStorage.setItem(CHAVE, preferencia);
            } catch {
                // Mantém a escolha nesta página se o armazenamento estiver bloqueado.
            }

            aplicarTema();
        });

        aplicarTema();
    }

    sistema.addEventListener("change", () => {
        if (!preferencia) {
            aplicarTema();
        }
    });

    window.addEventListener("storage", (event) => {
        if (event.key !== CHAVE && event.key !== null) {
            return;
        }

        preferencia = validarTema(event.newValue);
        aplicarTema();
    });

    aplicarTema();

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            criarBotao,
            { once: true }
        );
    } else {
        criarBotao();
    }
})();