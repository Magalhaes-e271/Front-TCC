(() => {
    "use strict";

    function iniciarPagina() {
        const ano = document.getElementById("ano-atual");

        if (ano) {
            ano.textContent = String(new Date().getFullYear());
        }

        const cabecalho = document.querySelector(".site-header");
        const botao = document.getElementById("btn-menu-publico");
        const menu = document.getElementById("menu-publico");

        if (
            !cabecalho ||
            !botao ||
            !menu ||
            cabecalho.dataset.menuInicializado === "true"
        ) {
            return;
        }

        cabecalho.dataset.menuInicializado = "true";
        cabecalho.classList.add("menu-pronto");

        const telaPequena = window.matchMedia("(max-width: 900px)");

        function definirMenu(aberto) {
            cabecalho.classList.toggle("menu-aberto", aberto);

            botao.setAttribute("aria-expanded", String(aberto));

            botao.setAttribute(
                "aria-label",
                aberto ? "Fechar menu" : "Abrir menu"
            );
        }

        botao.addEventListener("click", () => {
            const aberto = cabecalho.classList.contains("menu-aberto");
            definirMenu(!aberto);
        });

        menu.addEventListener("click", (event) => {
            if (event.target.closest("a")) {
                definirMenu(false);
            }
        });

        document.addEventListener("keydown", (event) => {
            if (
                event.key === "Escape" &&
                cabecalho.classList.contains("menu-aberto")
            ) {
                definirMenu(false);
                botao.focus();
            }
        });

        document.addEventListener("click", (event) => {
            if (
                telaPequena.matches &&
                !cabecalho.contains(event.target)
            ) {
                definirMenu(false);
            }
        });

        telaPequena.addEventListener("change", () => {
            definirMenu(false);
        });

        definirMenu(false);
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