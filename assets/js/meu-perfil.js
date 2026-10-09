(() => {
    "use strict";

    function iniciarPerfil() {
        const elemento = (id) => document.getElementById(id);
        const conteudo = elemento("conteudo-perfil");

        if (!conteudo || conteudo.dataset.inicializado === "true") {
            return;
        }

        conteudo.dataset.inicializado = "true";

        const aviso = elemento("pagina-erro");
        const tentarNovamente = elemento("tentar-novamente");

        const abas = [
            ...document.querySelectorAll("[data-secao]")
        ];

        const paineis = [
            ...document.querySelectorAll(".secao-perfil")
        ];

        const titulos = {
            pessoal: [
                "Dados pessoais e acesso",
                "Gerencie suas informações de cadastro na OficinaAprender+."
            ],
            profissional: [
                "Perfil profissional",
                "Consulte as informações sobre sua atuação e seus horários."
            ],
            descricao: [
                "Descrição do perfil",
                "Sua apresentação para os outros profissionais da plataforma."
            ]
        };

        function mostrarMensagem(texto = "", tipo = "erro") {
            aviso.textContent = texto;
            aviso.hidden = !texto;
            aviso.dataset.tipo = tipo;

            aviso.setAttribute(
                "role",
                tipo === "erro" ? "alert" : "status"
            );
        }

        function preencher(id, valor) {
            const vazio =
                valor === null ||
                valor === undefined ||
                String(valor).trim() === "";

            elemento(id).textContent = vazio
                ? "Não informado"
                : String(valor);
        }

        function formatarCPF(valor) {
            const cpf = String(valor || "").replace(/\D/g, "");

            return cpf.length === 11
                ? cpf.replace(
                    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
                    "$1.$2.$3-$4"
                )
                : String(valor || "");
        }

        function formatarTelefone(valor) {
            const telefone = String(valor || "").replace(/\D/g, "");

            if (telefone.length === 11) {
                return telefone.replace(
                    /^(\d{2})(\d{5})(\d{4})$/,
                    "($1) $2-$3"
                );
            }

            if (telefone.length === 10) {
                return telefone.replace(
                    /^(\d{2})(\d{4})(\d{4})$/,
                    "($1) $2-$3"
                );
            }

            return String(valor || "");
        }

        function formatarData(valor) {
            const data = String(valor || "").slice(0, 10);

            return /^\d{4}-\d{2}-\d{2}$/.test(data)
                ? data.split("-").reverse().join("/")
                : "";
        }

        function formatarHorario(valor) {
            const horario = String(valor || "");

            return /^\d{2}:\d{2}/.test(horario)
                ? horario.slice(0, 5)
                : "";
        }

        function mostrarSecao(secao) {
            abas.forEach((aba) => {
                const ativa = aba.dataset.secao === secao;

                aba.classList.toggle("ativa", ativa);
                aba.setAttribute("aria-selected", String(ativa));
                aba.tabIndex = ativa ? 0 : -1;
            });

            paineis.forEach((painel) => {
                painel.hidden = painel.id !== `secao-${secao}`;
            });

            const [titulo, subtitulo] = titulos[secao];

            elemento("titulo-pagina").textContent = titulo;
            elemento("subtitulo-pagina").textContent = subtitulo;
        }

        abas.forEach((aba, indice) => {
            aba.addEventListener("click", () => {
                mostrarSecao(aba.dataset.secao);
            });

            aba.addEventListener("keydown", (event) => {
                let proximo;

                if (event.key === "ArrowDown") {
                    proximo = (indice + 1) % abas.length;
                } else if (event.key === "ArrowUp") {
                    proximo = (indice - 1 + abas.length) % abas.length;
                } else if (event.key === "Home") {
                    proximo = 0;
                } else if (event.key === "End") {
                    proximo = abas.length - 1;
                } else {
                    return;
                }

                event.preventDefault();

                mostrarSecao(abas[proximo].dataset.secao);
                abas[proximo].focus();
            });
        });

        tentarNovamente.addEventListener("click", () => {
            location.reload();
        });

        mostrarSecao("pessoal");

        async function carregarPerfil() {
            mostrarMensagem("Carregando seu perfil…", "info");
            conteudo.setAttribute("aria-busy", "true");

            try {
                const usuario = await window.Oficina.exigirSessao();

                if (!usuario || !usuario.id || !usuario.perfil) {
                    throw new Error(
                        "O servidor não retornou os dados completos do seu perfil."
                    );
                }

                const perfil = usuario.perfil;

                const tipos = {
                    PROFISSIONAL: "Profissional",
                    PACIENTE: "Paciente",
                    RESPONSAVEL: "Responsável",
                    ADMIN: "Administrador",
                    ADMINISTRADOR: "Administrador"
                };

                preencher("perfil-nome", perfil.nome);
                preencher("perfil-id", usuario.id);
                preencher("perfil-cpf", formatarCPF(perfil.cpf));

                preencher(
                    "perfil-nascimento",
                    formatarData(perfil.dataNascimento)
                );

                preencher("perfil-email", usuario.email);

                preencher(
                    "perfil-telefone",
                    formatarTelefone(perfil.telefone)
                );

                preencher(
                    "perfil-tipo",
                    tipos[usuario.tipoUsuario] || usuario.tipoUsuario
                );

                preencher("perfil-ocupacao", perfil.ocupacao);
                preencher("perfil-instituicao", perfil.instituicao);

                preencher(
                    "perfil-entrada",
                    formatarHorario(perfil.horarioDeEntrada)
                );

                preencher(
                    "perfil-saida",
                    formatarHorario(perfil.horarioDeSaida)
                );

                const descricao = elemento("perfil-descricao");

                const htmlSeguro = window.Oficina.htmlSeguro(
                    perfil.conteudoHtml || ""
                );

                const doc = new DOMParser().parseFromString(
                    htmlSeguro,
                    "text/html"
                );

                if (doc.body.textContent.trim()) {
                    descricao.innerHTML = htmlSeguro;
                } else {
                    const mensagem = document.createElement("p");

                    mensagem.className = "descricao-vazia";
                    mensagem.textContent =
                        "Você ainda não adicionou uma descrição ao seu perfil.";

                    descricao.replaceChildren(mensagem);
                }

                conteudo.hidden = false;
                tentarNovamente.hidden = true;

                mostrarMensagem();

                await window.Oficina.imagem(
                    elemento("foto-perfil"),
                    perfil.urlFotoPerfil
                );
            } catch (erro) {
                mostrarMensagem(
                    erro.message || "Não foi possível carregar seu perfil."
                );

                tentarNovamente.hidden = false;
            } finally {
                conteudo.setAttribute("aria-busy", "false");
            }
        }

        void carregarPerfil();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarPerfil, {
            once: true
        });
    } else {
        iniciarPerfil();
    }
})();