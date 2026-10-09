(() => {
  "use strict";

  function iniciarAgenda() {
    const elemento = (id) => document.getElementById(id);
    const calendario = elemento("calendario-dias");

    if (!calendario || calendario.dataset.inicializado === "true") {
      return;
    }

    calendario.dataset.inicializado = "true";

    const lista = elemento("agenda-lista");
    const estadoDia = elemento("estado-dia");
    const modal = elemento("modal-agendamento");
    const form = elemento("agenda-form");
    const paciente = elemento("agenda-paciente");
    const novo = elemento("novo-atendimento");
    const atualizar = elemento("recarregar");

    const hoje = new Date();

    let selecionado = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate(),
        12
    );

    let mes = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        1,
        12
    );

    let eventos = [];
    let agendaDisponivel = false;
    let pacientesDisponiveis = false;
    let sessaoPronta = false;
    let carregando = false;
    let ocupado = false;

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

    function mensagem(id, texto = "", tipo = "erro") {
      const item = elemento(id);

      item.textContent = texto;
      item.hidden = !texto;
      item.dataset.tipo = tipo;

      item.setAttribute(
          "role",
          tipo === "erro" ? "alert" : "status"
      );
    }

    function chaveData(data) {
      const ano = data.getFullYear();
      const mesNumero = String(data.getMonth() + 1).padStart(2, "0");
      const dia = String(data.getDate()).padStart(2, "0");

      return `${ano}-${mesNumero}-${dia}`;
    }

    function eventosDoDia(data) {
      const inicio = new Date(
          data.getFullYear(),
          data.getMonth(),
          data.getDate()
      );

      const fim = new Date(
          data.getFullYear(),
          data.getMonth(),
          data.getDate() + 1
      );

      return eventos
          .filter((evento) => {
            return (
                new Date(evento.inicio) < fim &&
                new Date(evento.fim) > inicio
            );
          })
          .sort((a, b) => {
            return new Date(a.inicio) - new Date(b.inicio);
          });
    }

    function sincronizarControles() {
      atualizar.disabled = carregando || ocupado;
      novo.disabled = !sessaoPronta || carregando || ocupado;

      atualizar.querySelector("span").textContent = carregando
          ? "Atualizando…"
          : "Atualizar";

      form
          .querySelectorAll("input, textarea, select, button")
          .forEach((item) => {
            item.disabled = ocupado;
          });

      paciente.disabled = ocupado || !pacientesDisponiveis;

      elemento("salvar-agendamento").textContent = ocupado
          ? "Salvando…"
          : "Agendar atendimento";

      document
          .querySelectorAll(".cancelar-atendimento")
          .forEach((botao) => {
            botao.disabled = ocupado || carregando;
          });

      lista.setAttribute("aria-busy", String(carregando));
      form.setAttribute("aria-busy", String(ocupado));
    }

    function renderizarCalendario() {
      elemento("mes-atual").textContent = mes.toLocaleDateString(
          "pt-BR",
          {
            month: "long",
            year: "numeric"
          }
      );

      const primeiroDia = new Date(
          mes.getFullYear(),
          mes.getMonth(),
          1,
          12
      );

      const botoes = [];

      for (let i = 0; i < 42; i++) {
        const data = new Date(
            mes.getFullYear(),
            mes.getMonth(),
            1 - primeiroDia.getDay() + i,
            12
        );

        const botao = criar("button", "dia-calendario");
        const ativo = chaveData(data) === chaveData(selecionado);
        const ehHoje = chaveData(data) === chaveData(new Date());

        botao.type = "button";

        botao.classList.toggle(
            "outro-mes",
            data.getMonth() !== mes.getMonth()
        );

        botao.classList.toggle("hoje", ehHoje);
        botao.classList.toggle("selecionado", ativo);
        botao.setAttribute("aria-pressed", String(ativo));

        if (ehHoje) {
          botao.setAttribute("aria-current", "date");
        }

        const quantidade = agendaDisponivel
            ? eventosDoDia(data).length
            : 0;

        const dataCompleta = data.toLocaleDateString(
            "pt-BR",
            { dateStyle: "full" }
        );

        botao.setAttribute(
            "aria-label",
            dataCompleta +
            (agendaDisponivel
                ? `, ${quantidade} atendimentos`
                : "")
        );

        botao.append(
            criar("span", "numero-dia", String(data.getDate()))
        );

        if (quantidade > 0) {
          botao.append(
              criar("span", "marcador-dia", String(quantidade))
          );
        }

        botao.addEventListener("click", () => {
          selecionado = data;

          const mudouMes =
              data.getMonth() !== mes.getMonth() ||
              data.getFullYear() !== mes.getFullYear();

          if (mudouMes) {
            mes = new Date(
                data.getFullYear(),
                data.getMonth(),
                1,
                12
            );

            renderizar();

            calendario
                .querySelector('[aria-pressed="true"]')
                ?.focus();

            return;
          }

          calendario.querySelectorAll("button").forEach((item) => {
            const selecionadoAgora = item === botao;

            item.classList.toggle("selecionado", selecionadoAgora);
            item.setAttribute(
                "aria-pressed",
                String(selecionadoAgora)
            );
          });

          renderizarDia();
        });

        botoes.push(botao);
      }

      calendario.replaceChildren(...botoes);
    }

    function horarioDoEvento(evento) {
      const inicio = new Date(evento.inicio);
      const fim = new Date(evento.fim);

      const hora = (data) => {
        return data.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit"
        });
      };

      if (chaveData(inicio) === chaveData(fim)) {
        return `${hora(inicio)} – ${hora(fim)}`;
      }

      const dataHora = (data) => {
        return data.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
      };

      return `${dataHora(inicio)} → ${dataHora(fim)}`;
    }

    async function cancelar(evento) {
      if (ocupado || carregando) {
        return;
      }

      ocupado = true;
      sincronizarControles();

      try {
        await window.Oficina.delete(
            `/agenda/${encodeURIComponent(evento.id)}`
        );

        const atualizada = await carregar();

        if (atualizada) {
          mensagem(
              "pagina-erro",
              "Atendimento cancelado.",
              "sucesso"
          );
        }
      } catch (erro) {
        mensagem(
            "pagina-erro",
            erro.message || "Não foi possível cancelar o atendimento."
        );
      } finally {
        ocupado = false;
        sincronizarControles();
      }
    }

    function renderizarDia() {
      elemento("dia-selecionado").textContent =
          selecionado.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long"
          });

      lista.replaceChildren();

      if (!agendaDisponivel) {
        elemento("contador-dia").textContent = "—";
        estadoDia.hidden = false;

        estadoDia.textContent = carregando
            ? "Carregando atendimentos…"
            : "A lista de atendimentos está indisponível. Tente atualizar a agenda.";

        return;
      }

      const agendamentos = eventosDoDia(selecionado);
      const quantidade = agendamentos.length;

      elemento("contador-dia").textContent =
          `${quantidade} ${quantidade === 1 ? "atendimento" : "atendimentos"}`;

      estadoDia.hidden = quantidade > 0;

      estadoDia.textContent =
          "Nenhum atendimento neste dia. Use Novo atendimento para agendar.";

      agendamentos.forEach((evento) => {
        const card = criar("article", "cartao-atendimento");

        card.append(
            criar(
                "p",
                "horario-atendimento",
                horarioDoEvento(evento)
            ),
            criar(
                "h3",
                "titulo-atendimento",
                evento.titulo || "Atendimento"
            )
        );

        const nome =
            evento.paciente?.perfil?.nome ||
            evento.paciente?.nome ||
            evento.paciente?.email;

        card.append(
            criar(
                "p",
                "paciente-atendimento",
                nome || "Sem paciente vinculado"
            )
        );

        if (evento.observacoes) {
          card.append(
              criar(
                  "p",
                  "observacoes-atendimento",
                  evento.observacoes
              )
          );
        }

        const botao = criar(
            "button",
            "cancelar-atendimento",
            "Cancelar atendimento"
        );

        botao.type = "button";

        botao.addEventListener("click", () => {
          void cancelar(evento);
        });

        card.append(botao);
        lista.append(card);
      });

      sincronizarControles();
    }

    function renderizar() {
      renderizarCalendario();
      renderizarDia();
    }

    function mudarMes(diferenca) {
      const proximo = new Date(
          mes.getFullYear(),
          mes.getMonth() + diferenca,
          1,
          12
      );

      const ultimoDia = new Date(
          proximo.getFullYear(),
          proximo.getMonth() + 1,
          0
      ).getDate();

      selecionado = new Date(
          proximo.getFullYear(),
          proximo.getMonth(),
          Math.min(selecionado.getDate(), ultimoDia),
          12
      );

      mes = proximo;

      renderizar();
    }

    async function carregar() {
      if (carregando) {
        return false;
      }

      carregando = true;
      agendaDisponivel = false;
      pacientesDisponiveis = false;

      paciente.replaceChildren(new Option("Sem paciente", ""));

      mensagem("pagina-erro", "Carregando agenda…", "info");

      renderizar();
      sincronizarControles();

      try {
        const usuario = await window.Oficina.exigirSessao();

        if (usuario.tipoUsuario !== "PROFISSIONAL") {
          sessaoPronta = false;

          throw new Error(
              "A agenda está disponível para profissionais."
          );
        }

        sessaoPronta = true;

        const [respostaAgenda, respostaPacientes] =
            await Promise.allSettled([
              window.Oficina.get("/agenda"),
              window.Oficina.get("/paciente")
            ]);

        if (
            respostaPacientes.status === "fulfilled" &&
            Array.isArray(respostaPacientes.value)
        ) {
          respostaPacientes.value.forEach((item) => {
            if (item.id == null) {
              return;
            }

            const nome =
                item.perfil?.nome ||
                item.nome ||
                item.email ||
                "Paciente";

            paciente.append(
                new Option(nome, String(item.id))
            );
          });

          pacientesDisponiveis = true;
          mensagem("pacientes-aviso");
        } else {
          mensagem(
              "pacientes-aviso",
              "Os pacientes estão indisponíveis. Você pode agendar sem vincular um paciente.",
              "info"
          );
        }

        if (respostaAgenda.status === "rejected") {
          throw respostaAgenda.reason;
        }

        const dados = respostaAgenda.value;

        const agendaInvalida =
            !Array.isArray(dados) ||
            dados.some((item) => {
              return (
                  !item ||
                  item.id == null ||
                  !Number.isFinite(new Date(item.inicio).getTime()) ||
                  !Number.isFinite(new Date(item.fim).getTime()) ||
                  new Date(item.fim) <= new Date(item.inicio)
              );
            });

        if (agendaInvalida) {
          throw new Error(
              "O servidor não retornou uma agenda válida."
          );
        }

        eventos = dados;
        agendaDisponivel = true;

        mensagem("pagina-erro");
      } catch (erro) {
        mensagem(
            "pagina-erro",
            erro.message || "Não foi possível carregar a agenda."
        );
      } finally {
        carregando = false;

        renderizar();
        sincronizarControles();
      }

      return agendaDisponivel;
    }

    novo.addEventListener("click", () => {
      if (!sessaoPronta || ocupado || carregando) {
        return;
      }

      form.reset();
      mensagem("agenda-erro");

      const data = chaveData(selecionado);

      elemento("agenda-inicio").value = `${data}T09:00`;
      elemento("agenda-fim").value = `${data}T10:00`;

      sincronizarControles();

      modal.showModal();
      elemento("agenda-titulo").focus();
    });

    form.querySelectorAll("[data-fechar]").forEach((botao) => {
      botao.addEventListener("click", () => {
        if (!ocupado) {
          modal.close();
        }
      });
    });

    modal.addEventListener("cancel", (event) => {
      if (ocupado) {
        event.preventDefault();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!sessaoPronta || ocupado || !form.reportValidity()) {
        return;
      }

      mensagem("agenda-erro");

      const titulo = elemento("agenda-titulo").value.trim();
      const inicio = new Date(elemento("agenda-inicio").value);
      const fim = new Date(elemento("agenda-fim").value);

      if (!titulo) {
        mensagem(
            "agenda-erro",
            "Informe o título do atendimento."
        );

        return;
      }

      if (
          !Number.isFinite(inicio.getTime()) ||
          !Number.isFinite(fim.getTime()) ||
          fim <= inicio
      ) {
        mensagem(
            "agenda-erro",
            "O fim do atendimento deve ser depois do início."
        );

        return;
      }

      const idPaciente = paciente.value
          ? Number(paciente.value)
          : null;

      if (
          idPaciente !== null &&
          (!Number.isSafeInteger(idPaciente) || idPaciente <= 0)
      ) {
        mensagem(
            "agenda-erro",
            "Selecione um paciente válido."
        );

        return;
      }

      const dados = {
        titulo,
        idPaciente,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        observacoes: elemento("agenda-observacoes").value.trim()
      };

      ocupado = true;
      sincronizarControles();

      try {
        await window.Oficina.post("/agenda/criar", dados);

        modal.close();

        selecionado = new Date(
            inicio.getFullYear(),
            inicio.getMonth(),
            inicio.getDate(),
            12
        );

        mes = new Date(
            inicio.getFullYear(),
            inicio.getMonth(),
            1,
            12
        );

        const atualizada = await carregar();

        if (atualizada) {
          mensagem(
              "pagina-erro",
              "Atendimento agendado com sucesso.",
              "sucesso"
          );
        }
      } catch (erro) {
        mensagem(
            "agenda-erro",
            erro.message || "Não foi possível agendar o atendimento."
        );
      } finally {
        ocupado = false;
        sincronizarControles();
      }
    });

    elemento("mes-anterior").addEventListener("click", () => {
      mudarMes(-1);
    });

    elemento("mes-proximo").addEventListener("click", () => {
      mudarMes(1);
    });

    elemento("ir-hoje").addEventListener("click", () => {
      const data = new Date();

      selecionado = new Date(
          data.getFullYear(),
          data.getMonth(),
          data.getDate(),
          12
      );

      mes = new Date(
          data.getFullYear(),
          data.getMonth(),
          1,
          12
      );

      renderizar();
    });

    atualizar.addEventListener("click", () => {
      void carregar();
    });

    void carregar();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarAgenda,
        { once: true }
    );
  } else {
    iniciarAgenda();
  }
})();