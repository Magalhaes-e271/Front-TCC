// NOVO: assets/js/conexao.js

(() => {
    "use strict";

    if (window.OficinaConexao) return;

    const config = window.OFICINA_CONFIG || {};

    let pendente = null;
    let estado = "inicial";

    function atualizar(novoEstado, texto) {
        estado = novoEstado;

        const painel = document.getElementById("conexao-servidor");
        const status = document.getElementById("conexao-status");
        const botao = document.getElementById("conexao-tentar");

        if (painel) painel.dataset.estado = estado;
        if (status) status.textContent = texto;
        if (botao) botao.hidden = estado !== "erro";
    }

    async function verificar() {
        const base = typeof config.apiBase === "string"
            ? config.apiBase.trim().replace(/\/+$/, "")
            : "";

        const rota = config.healthPath || "/health";

        if (!base || !rota.startsWith("/") || rota.startsWith("//")) {
            throw new Error(
                "Verifique a configuração da conexão do site."
            );
        }

        const prazo = Number(config.conexaoTimeoutMs);

        const limite = Date.now() + (
            Number.isFinite(prazo) && prazo > 0
                ? prazo
                : 120000
        );

        atualizar(
            "conectando",
            "Conectando ao servidor… O primeiro acesso pode levar cerca de um minuto."
        );

        while (Date.now() < limite) {
            const controller = new AbortController();

            const timer = setTimeout(
                () => controller.abort(),
                Math.min(20000, limite - Date.now())
            );

            try {
                // Consulta pública: não envia senha, token ou cookies.
                const resposta = await fetch(base + rota, {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    },
                    credentials: "omit",
                    cache: "no-store",
                    signal: controller.signal
                });

                if ([401, 403, 404].includes(resposta.status)) {
                    const erro = new Error(
                        "Não foi possível verificar a conexão. " +
                        "Confirme que a rota /health está publicada " +
                        "e liberada no servidor."
                    );

                    erro.definitivo = true;
                    throw erro;
                }

                if (resposta.ok) {
                    // HTML de inicialização do Render não confirma conexão.
                    const dados = await resposta.json();

                    if (dados?.status === "UP") {
                        atualizar(
                            "conectado",
                            "Servidor conectado."
                        );

                        return;
                    }
                }
            } catch (erro) {
                if (erro.definitivo) throw erro;

                // Repete somente o GET de disponibilidade.
            } finally {
                clearTimeout(timer);
            }

            const restante = limite - Date.now();

            if (restante > 0) {
                await new Promise(resolve => {
                    setTimeout(resolve, Math.min(3000, restante));
                });
            }
        }

        throw new Error(
            "Não foi possível conectar ao servidor no tempo esperado. " +
            "Verifique sua internet e tente novamente."
        );
    }

    function conectar() {
        if (estado === "conectado") {
            return Promise.resolve();
        }

        // Evita verificações duplicadas na mesma página.
        if (pendente) return pendente;

        pendente = verificar()
            .catch(erro => {
                atualizar("erro", erro.message);
                throw erro;
            })
            .finally(() => {
                pendente = null;
            });

        return pendente;
    }

    window.OficinaConexao = {
        conectar,
        estado: () => estado
    };

    function iniciar() {
        const botao = document.getElementById("conexao-tentar");

        if (botao) {
            botao.addEventListener("click", () => {
                conectar().catch(() => {});
            });
        }

        // A falha já é apresentada no painel.
        conectar().catch(() => {});
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            {once: true}
        );
    } else {
        iniciar();
    }
})();