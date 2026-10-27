/* Metas e postagens persistidas na API do Oficina Aprender. */
const ICONE_PADRAO = "../assets/icons/user-icon.png";
const ROTULO_EXPANDIR = "Ver descrição completa";
const ROTULO_RECOLHER = "Recolher descrição";
const SVG_NS = "http://www.w3.org/2000/svg";
const ROTULOS_POSTAGEM = {
  REGISTRO_SESSAO: "Registro de sessão",
  ORIENTACAO_FAMILIA: "Orientação à família",
  ORIENTACAO_ESCOLA: "Orientação à escola",
  EVOLUCAO: "Evolução",
  ATIVIDADE: "Atividade",
  RELATORIO: "Relatório",
  COMUNICADO: "Comunicado",
  DESCRICAO: "Descrição",
};
const TIPOS_POSTAGEM = Object.keys(ROTULOS_POSTAGEM);
const idPacienteAtual = new URLSearchParams(location.search).get("paciente");
function pessoa(p) {
  return p
    ? {
        id: p.id,
        nome: p.nome || p.perfil?.nome || p.email,
        imgUrl: p.urlFotoPerfil || p.perfil?.urlFotoPerfil,
      }
    : null;
}
function postagem(p) {
  return {
    ...p,
    tipo: ROTULOS_POSTAGEM[p.tipoPostagem] || p.tipoPostagem,
    conteudoHTML: p.conteudoHtml,
    autor: pessoa(p.autor),
  };
}
function aplicarCorArea(elemento, area) {
  let hash = 0;
  const texto = String(area || "").trim().toLocaleLowerCase("pt-BR");
  for (let i = 0; i < texto.length; i++)
    hash = (Math.imul(hash, 31) + texto.charCodeAt(i)) | 0;
  elemento.style.setProperty("--area-hue", String((hash % 360 + 360) % 360));
}
function meta(m) {
  return {
    ...m,
    descricaoHTML: m.conteudoHtml,
    textoBusca: [
      m.titulo,
      m.area,
      pessoa(m.responsavel)?.nome,
      htmlParaTexto(m.conteudoHtml),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR"),
    responsavel: pessoa(m.responsavel),
    atualizadoPor: pessoa(m.atualizadoPor),
    dataUltimaEdit: m.dataAtualizacao,
    anteriores: m.anteriores || [],
  };
}
const API = {
  async buscarPaciente(id) {
    const p = await Oficina.get(`/paciente/${id}`);
    const perfil = p.perfil || {};
    return {
      fotoUrl: perfil.urlFotoPerfil,
      nome: perfil.nome || p.email,
      idade: Oficina.idade(perfil.dataNascimento),
      condicoes: perfil.condicoes || "Condição não informada",
      descricaoHTML: perfil.conteudoHtml || "",
    };
  },
  async buscarMetas(id) {
    const lista = await Oficina.get(`/meta?idPaciente=${id}`);
    return lista.map((m) => ({
      ...meta(m),
      postagens: [],
      postagensCarregadas: false,
    }));
  },
  async criarPostagem(id, dados, arquivos) {
    if (
      arquivos.some((a) => a.size > 10 * 1024 * 1024) ||
      arquivos.reduce((s, a) => s + a.size, 0) > 11 * 1024 * 1024
    )
      throw new Error("Use arquivos de até 10 MB e até 11 MB no total.");
    const form = new FormData();
    form.append(
      "dados",
      new Blob(
        [
          JSON.stringify({
            titulo: dados.titulo,
            tipoPostagem: dados.tipo,
            conteudoHtml: dados.conteudoHTML,
            respondeA: dados.respondeA,
            visualizacao: dados.visualizacao,
          }),
        ],
        { type: "application/json" },
      ),
    );
    arquivos.forEach((a) => form.append("arquivos", a));
    return postagem(
      await Oficina.post(`/postagem/publicar?idMeta=${id}`, form),
    );
  },
  alterarConclusao: (id, concluido, versao) =>
    Oficina.patch(`/meta/${id}`, {
      concluido,
      ...(versao == null ? {} : { versao }),
    }),
  excluir: (id) => Oficina.delete(`/meta/${id}`),
};

/* ---------- 3. ESTADO E ELEMENTOS ---------- */
const metas = []; // todas as metas do paciente
const areasSelecionadas = new Set(); // vazio = todas as áreas
let metaAbertaId = null;
let respondendoAId = null;
let arquivosSelecionados = [];
let cardsPorId = new Map();
let ligacoesAtuais = [];
let podeGerenciar = false;
let usuarioAtualId = null;
let carregando = false;
let focoMetaId = null;
let modoVisual = "mapa";
let escalaMapa = 1;
let layoutAtual = null;
let abaAtual = "visao";
let edicaoBase = null;
let conexoesBase = null;
let gravandoMeta = false;
const grafo = window.GrafoMetas;

// paciente
const campoFoto = document.getElementById("foto-perfil");
const campoNomeIdade = document.getElementById("nome-idade");
const campoCondicoes = document.getElementById("condicoes");
const campoDescricao = document.getElementById("descricao-paciente");

// metas
const canvas = document.getElementById("metas-canvas");
const svgLinhas = document.getElementById("metas-linhas");
const msgVazio = document.getElementById("metas-vazio");

// filtro
const filtroAreas = document.getElementById("areas-filtro");
const btnAreas = document.getElementById("btn-areas");
const menuAreas = document.getElementById("areas-menu");
const resumoAreas = document.getElementById("areas-resumo");

// meta expandida
const overlayMeta = document.getElementById("overlay-meta");
const janelaMeta = document.getElementById("meta-expandida");
const expTitulo = document.getElementById("meta-exp-titulo");
const expArea = document.getElementById("meta-exp-area");
const expDescricao = document.getElementById("meta-exp-descricao");
const btnAddPostagem = document.getElementById("btn-add-postagem");
const btnConcluir = document.getElementById("btn-concluir");
const btnExcluirMeta = document.getElementById("btn-excluir-meta");
const listaPostagens = document.getElementById("lista-postagens");
const postagensVazio = document.getElementById("postagens-vazio");

// formulário
const overlayForm = document.getElementById("overlay-form");
const formPostagem = document.getElementById("form-postagem");
const formContexto = document.getElementById("form-contexto");
const inputTitulo = document.getElementById("post-titulo");
const selectTipo = document.getElementById("post-tipo");
const inputConteudo = document.getElementById("post-conteudo");
const inputAnexos = document.getElementById("input-anexos");
const listaAnexos = document.getElementById("lista-anexos");
const formErro = document.getElementById("form-erro");
const btnEnviar = document.getElementById("btn-enviar");

/* ---------- 4. UTILITÁRIOS ---------- */
// cria elemento sem concatenar HTML (texto entra como textContent, evitando injeção)
function criar(tag, { classe, texto, html, attrs } = {}, ...filhos) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  if (html !== undefined) e.innerHTML = Oficina.htmlSeguro(html); // só para HTML vindo do servidor (ver nota de segurança)
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  filhos.forEach((f) => e.append(f));
  return e;
}

function escaparHTML(t) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// texto digitado no formulário -> HTML seguro (parágrafos e quebras de linha)
function textoParaHTML(t) {
  return t
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escaparHTML(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function formatarData(iso) {
  const d = new Date(iso);
  return isNaN(d)
    ? ""
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarTamanho(bytes) {
  if (typeof bytes !== "number") return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function criarAvatar(usuario) {
  const img = criar("img", { attrs: { alt: "" } });
  Oficina.imagem(img, usuario?.imgUrl);
  img.addEventListener(
    "error",
    () => {
      img.src = ICONE_PADRAO;
    },
    { once: true },
  );
  return img;
}

// janelas (overlays)
const focoAnterior = new Map();

function abrirOverlay(overlay, focar) {
  focoAnterior.set(overlay, document.activeElement);
  overlay.hidden = false;
  atualizarScroll();
  if (focar) focar.focus();
}

function fecharOverlay(overlay) {
  overlay.hidden = true;
  atualizarScroll();
  const anterior = focoAnterior.get(overlay);
  if (anterior && document.contains(anterior)) anterior.focus();
}

function atualizarScroll() {
  const aberta = !overlayMeta.hidden || !overlayForm.hidden;
  document.body.classList.toggle("sem-scroll", aberta);
  document.getElementById("metas-pagina").inert = aberta;
  overlayMeta.inert = !overlayForm.hidden;
}

/* ---------- 5. PACIENTE ---------- */
function preencherPaciente(p) {
  Oficina.imagem(campoFoto, p.fotoUrl);
  campoNomeIdade.textContent = `${p.nome} · ${p.idade}`;
  campoCondicoes.textContent = p.condicoes;
  campoDescricao.innerHTML = Oficina.htmlSeguro(p.descricaoHTML);
  const temDescricao = Boolean(campoDescricao.textContent.trim());
  document.getElementById("expand-descricao").hidden = !temDescricao;
  if (!temDescricao)
    campoDescricao.textContent =
      "Ainda não há uma descrição cadastrada para o aluno.";
}

// toggle descrição do paciente
const toggleDescPaciente = document.getElementById("expand-descricao");
const areaPaciente = document.getElementById("paciente-area");
toggleDescPaciente.addEventListener("click", () => {
  const expandida = toggleDescPaciente.getAttribute("aria-expanded") !== "true";
  campoDescricao.classList.toggle("descricao-paciente-collapsed", !expandida);
  campoDescricao.classList.toggle("descricao-paciente-expanded", expandida);
  toggleDescPaciente.setAttribute("aria-expanded", String(expandida));
  toggleDescPaciente.textContent = expandida
    ? ROTULO_RECOLHER
    : ROTULO_EXPANDIR;
});

/* ---------- 6. METAS ---------- */
// adiciona (ou substitui, se o id já existir) uma meta e redesenha
function addMeta(infos, redesenhar = true) {
  const meta = { anteriores: [], postagens: [], concluido: false, ...infos };
  const i = metas.findIndex((m) => m.id === meta.id);
  if (i >= 0) metas[i] = meta;
  else metas.push(meta);
  if (redesenhar) {
    renderizarMenuAreas();
    renderizarColaboracao();
    renderizarMetas();
  }
}

function metasVisiveis() {
  const texto = document
    .getElementById("busca-metas")
    .value.trim()
    .toLocaleLowerCase("pt-BR");
  const status = document.getElementById("filtro-status").value;
  const autor = document.getElementById("filtro-autor").value;
  const grupo =
    focoMetaId && grafo ? grafo.conectadas(metas, focoMetaId) : null;
  return metas.filter(
    (m) =>
      (!areasSelecionadas.size || areasSelecionadas.has(m.area)) &&
      (status === "todas" ||
        (status === "concluidas" ? m.concluido : !m.concluido)) &&
      (autor === "todos" ||
        String(m.responsavel?.id ?? m.responsavel?.nome) === autor) &&
      (!grupo || grupo.has(Number(m.id))) &&
      (!texto || m.textoBusca.includes(texto)),
  );
}
function calcularLayout(visiveis) {
  return grafo.layout(metas, visiveis);
}

function criarCardMeta(meta) {
  const cabecalho = criar(
    "div",
    { classe: "meta-header" },
    criarAvatar(meta.responsavel),
    criar("span", {
      texto: meta.responsavel?.nome || "Equipe de acompanhamento",
    }),
  );
  const seloArea = criar("span", {
    classe: "area-meta",
    texto: meta.area,
    attrs: { title: meta.area },
  });
  aplicarCorArea(seloArea, meta.area);
  const etiquetas = criar(
    "div",
    { classe: "meta-etiquetas" },
    seloArea,
    criar("span", {
      classe: `status-meta ${meta.concluido ? "status-concluida" : "status-andamento"}`,
      texto: meta.concluido ? "✓ Concluída" : "Em andamento",
      attrs: { "aria-label": meta.concluido ? "Meta concluída" : "Meta em andamento" },
    }),
  );
  const botao = criar("button", {
    classe: "expand-desc-meta",
    texto: "Ver meta →",
    attrs: { type: "button", "aria-label": `Abrir meta ${meta.titulo}` },
  });
  botao.addEventListener("click", () => abrirMeta(meta.id));
  const quantidade = meta.totalPostagens ?? (meta.postagens || []).length;
  const rodape = criar(
    "div",
    { classe: "meta-rodape" },
    criar("span", {
      texto: `${quantidade} ${quantidade === 1 ? "registro" : "registros"}`,
    }),
    botao,
  );
  const corpo = criar(
    "div",
    { classe: "meta" + (meta.concluido ? " concluida" : "") },
    etiquetas,
    criar("h3", { texto: meta.titulo }),
    criar("div", {
      classe: "descricao-meta-container",
      html: meta.descricaoHTML || "",
    }),
    rodape,
  );
  const card = criar(
    "article",
    {
      classe: `meta-container ${meta.concluido ? "meta-concluida" : "meta-em-andamento"}`,
      attrs: { id: `meta-${meta.id}`, "data-id": meta.id },
    },
    cabecalho,
    corpo,
    criar("button", {
      classe: "atalho-conectar",
      texto: "↗",
      attrs: { type: "button", "aria-label": `Conexões de ${meta.titulo}` },
    }),
  );
  card.querySelector(".atalho-conectar").addEventListener("click", () => {
    abrirMeta(meta.id);
    selecionarAba("conexoes");
  });
  return card;
}

function atualizarResumo() {
  const concluidas = metas.filter((m) => m.concluido).length;
  const percentual = metas.length
    ? Math.round((concluidas * 100) / metas.length)
    : 0;
  document.getElementById("total-metas").textContent = metas.length;
  document.getElementById("concluidas-metas").textContent = concluidas;
  document.getElementById("andamento-metas").textContent =
    metas.length - concluidas;
  document.getElementById("progresso-valor").textContent = `${percentual}%`;
  document.getElementById("progresso-metas").value = percentual;
  const quantidade = metasVisiveis().length;
  document.getElementById("metas-visiveis").textContent =
    `${quantidade} ${quantidade === 1 ? "meta exibida" : "metas exibidas"}`;
  document.getElementById("metas-vazio-texto").textContent = metas.length
    ? "Nenhuma meta corresponde às áreas selecionadas. Ajuste o filtro para continuar."
    : podeGerenciar
      ? "Adicione uma meta para começar a acompanhar a aprendizagem."
      : "As metas cadastradas pela sua equipe aparecerão aqui.";
}

function renderizarMetas() {
  atualizarResumo();
  const visiveis = metasVisiveis();
  const layout = calcularLayout(visiveis);
  layoutAtual = layout;

  canvas.querySelectorAll(".meta-container").forEach((c) => c.remove());
  cardsPorId = new Map();
  canvas.style.setProperty("--cols", layout.colunas);
  canvas.style.setProperty("--rows", layout.linhas);

  visiveis.forEach((meta) => {
    const pos = layout.posicoes.get(meta.id);
    const card = criarCardMeta(meta);
    card.style.setProperty("--col", pos.coluna);
    card.style.setProperty("--row", pos.linha);
    canvas.append(card);
    cardsPorId.set(meta.id, card);
  });

  msgVazio.hidden = visiveis.length > 0;
  ligacoesAtuais = layout.ligacoes;
  desenharLinhas();
  dimensionarMapa();
}

// linhas curvas do lado direito da meta anterior até o lado esquerdo da seguinte
function desenharLinhas() {
  svgLinhas.querySelectorAll("path.linha-meta").forEach((p) => p.remove());
  ligacoesAtuais.forEach(([paiId, filhoId]) => {
    const pai = cardsPorId.get(paiId);
    const filho = cardsPorId.get(filhoId);
    if (!pai || !filho) return;
    const caixaPai = pai.querySelector(".meta");
    const caixaFilho = filho.querySelector(".meta");
    const x1 = pai.offsetLeft + pai.offsetWidth;
    const y1 = pai.offsetTop + caixaPai.offsetTop + caixaPai.offsetHeight / 2;
    const x2 = filho.offsetLeft;
    const y2 =
      filho.offsetTop + caixaFilho.offsetTop + caixaFilho.offsetHeight / 2;
    // Reserva um trecho horizontal maior que a ponta: a curva termina antes
    // do triângulo, e a linha entra pelo centro de sua base, mesmo entre linhas distantes.
    const entradaX = x2 - Math.min(24, Math.max(0, (x2 - x1) / 2));
    const dx = (entradaX - x1) / 2;
    const linha = document.createElementNS(SVG_NS, "path");
    const indireta = layoutAtual?.indiretas?.has(`${paiId}:${filhoId}`);
    linha.setAttribute("class", "linha-meta" + (indireta ? " indireta" : ""));
    linha.dataset.origem = paiId;
    linha.dataset.destino = filhoId;
    const titulo = document.createElementNS(SVG_NS, "title");
    titulo.textContent = indireta
      ? "Ligação indireta: há metas ocultas pelo filtro entre estes objetivos."
      : "Conexão entre metas";
    linha.append(titulo);
    linha.setAttribute(
      "d",
      `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${entradaX - dx} ${y2}, ${entradaX} ${y2} L ${x2} ${y2}`,
    );
    linha.setAttribute("marker-end", "url(#seta)");
    svgLinhas.append(linha);
  });
}

window.addEventListener("resize", desenharLinhas); // tamanhos em vh mudam com a janela

/* ---------- 7. FILTRO DE ÁREAS ---------- */
let checkTodas = null;
const checksPorArea = new Map();

function criarOpcaoArea(rotulo, marcado, aoMudar) {
  const input = criar("input", { attrs: { type: "checkbox" } });
  input.checked = marcado;
  input.addEventListener("change", () => aoMudar(input));
  const label = criar(
    "label",
    { classe: "areas-opcao" },
    input,
    criar("span", { texto: rotulo }),
  );
  return { label, input };
}

function sincronizarFiltro() {
  checkTodas.checked = areasSelecionadas.size === 0;
  checksPorArea.forEach((input, area) => {
    input.checked = areasSelecionadas.has(area);
  });
  resumoAreas.textContent = areasSelecionadas.size
    ? [...areasSelecionadas].join(", ")
    : "Todas as áreas";
}

function renderizarMenuAreas() {
  const areas = [...new Set(metas.map((m) => m.area))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  areasSelecionadas.forEach((a) => {
    if (!areas.includes(a)) areasSelecionadas.delete(a);
  });
  checksPorArea.clear();

  const todas = criarOpcaoArea("Todas as áreas", true, (input) => {
    if (input.checked) areasSelecionadas.clear();
    sincronizarFiltro();
    renderizarMetas();
  });
  checkTodas = todas.input;

  const opcoes = areas.map((area) => {
    const op = criarOpcaoArea(area, false, (input) => {
      if (input.checked) areasSelecionadas.add(area);
      else areasSelecionadas.delete(area);
      sincronizarFiltro();
      renderizarMetas();
    });
    checksPorArea.set(area, op.input);
    return op.label;
  });

  menuAreas.replaceChildren(todas.label, ...opcoes);
  sincronizarFiltro();
}

function fecharMenuAreas() {
  menuAreas.hidden = true;
  btnAreas.setAttribute("aria-expanded", "false");
}

btnAreas.addEventListener("click", () => {
  menuAreas.hidden = !menuAreas.hidden;
  btnAreas.setAttribute("aria-expanded", String(!menuAreas.hidden));
});

document.addEventListener("click", (e) => {
  if (!filtroAreas.contains(e.target)) fecharMenuAreas();
});

/* ---------- 8. META EXPANDIDA E POSTAGENS ---------- */
function abrirMeta(id) {
  metaAbertaId = id;
  Oficina.mensagem(document.getElementById("meta-erro"), "");
  selecionarAba("visao");
  conexoesBase = null;
  edicaoBase = null;
  document.getElementById("form-conexoes").hidden = true;
  document.getElementById("conexoes-resumo").hidden = false;
  renderizarMetaAberta();
  void carregarPostagens(metas.find((m) => m.id === id));
  abrirOverlay(overlayMeta, document.getElementById("fechar-meta"));
}

function fecharMeta() {
  if (gravandoMeta) return;
  definirMaximizacaoConexoes(false);
  const id = metaAbertaId;
  metaAbertaId = null;
  fecharOverlay(overlayMeta);
  document.getElementById(`meta-${id}`)?.querySelector("button")?.focus();
}

function renderizarMetaAberta() {
  const meta = metas.find((m) => m.id === metaAbertaId);
  if (!meta) return;

  expTitulo.textContent = meta.titulo;
  expArea.textContent = meta.area;
  aplicarCorArea(expArea, meta.area);
  expDescricao.innerHTML = Oficina.htmlSeguro(meta.descricaoHTML);
  const autorPodeEditar = podeEditarMeta(meta);
  document.getElementById("aba-editar").hidden = !autorPodeEditar;
  document.getElementById("editar-conexoes").hidden =
    !autorPodeEditar || !document.getElementById("form-conexoes").hidden;
  document.getElementById("meta-autoria").textContent =
    `Criada por ${meta.responsavel?.nome || "equipe"}${meta.atualizadoPor?.nome ? " · Última atualização por " + meta.atualizadoPor.nome : ""}${meta.dataUltimaEdit ? " · " + formatarData(meta.dataUltimaEdit) : ""}`;
  renderizarConexoesResumo(meta);
  btnConcluir.textContent = meta.concluido
    ? "Reabrir meta"
    : "Marcar como concluída";
  btnExcluirMeta.hidden = !podeGerenciar;
  janelaMeta.classList.toggle("concluida", !!meta.concluido);

  const postagens = ordenarPostagensComRespostas(meta.postagens || []);
  listaPostagens.replaceChildren(
    ...postagens.map((p) => criarCardPostagem(p, meta)),
  );
  postagensVazio.hidden = postagens.length > 0;
  postagensVazio.textContent = meta.postagensCarregadas
    ? "Nenhuma postagem ainda. Os novos registros aparecerão aqui."
    : "Carregando registros…";
}

function ordenarPostagensComRespostas(postagens) {
  const porId = new Set(postagens.map((post) => String(post.id)));
  const respostas = new Map();
  const raizes = [];
  const porData = (a, b) => new Date(a.dataCriacao) - new Date(b.dataCriacao);

  postagens.forEach((post) => {
    const pai = post.respondeA;
    if (pai == null || !porId.has(String(pai)) || String(pai) === String(post.id)) {
      raizes.push(post);
      return;
    }
    const chave = String(pai);
    if (!respostas.has(chave)) respostas.set(chave, []);
    respostas.get(chave).push(post);
  });

  raizes.sort((a, b) => porData(b, a));
  respostas.forEach((itens) => itens.sort(porData));

  const ordenadas = [];
  const visitadas = new Set();
  function incluir(post) {
    const id = String(post.id);
    if (visitadas.has(id)) return;
    visitadas.add(id);
    ordenadas.push(post);
    (respostas.get(id) || []).forEach(incluir);
  }

  raizes.forEach(incluir);
  [...postagens]
    .sort((a, b) => porData(b, a))
    .forEach((post) => {
      if (!visitadas.has(String(post.id))) incluir(post);
    });
  return ordenadas;
}

function criarCardPostagem(post, meta) {
  const card = criar(
    "article",
    {
      classe: post.respondeA != null ? "postagem postagem-encadeada" : "postagem",
      attrs: { "data-id": post.id },
    },
    criar(
      "div",
      { classe: "postagem-topo" },
      criarAvatar(post.autor),
      criar("span", { texto: post.autor ? post.autor.nome : "" }),
      criar("span", {
        classe: "postagem-data",
        texto: formatarData(post.dataCriacao),
      }),
    ),
  );

  const original =
    post.respondeA != null
      ? meta.postagens.find((p) => p.id === post.respondeA)
      : null;
  if (original)
    card.append(
      criar("div", {
        classe: "postagem-resposta",
        texto: `↳ em resposta a “${original.titulo}”`,
      }),
    );

  card.append(
    criar(
      "div",
      { classe: "postagem-titulo" },
      criar("strong", { texto: `${post.titulo} - ${post.tipo}` }),
    ),
    criar("div", {
      classe: "postagem-conteudo",
      html: post.conteudoHTML || "",
    }),
  );

  if (post.anexos && post.anexos.length) {
    card.append(
      criar(
        "ul",
        { classe: "postagem-anexos" },
        ...post.anexos.map((a) =>
          criar(
            "li",
            {},
            criar("a", {
              classe: "anexo",
              texto: `📎 ${a.nome} (${formatarTamanho(a.tamanhoArquivo)})`,
              attrs: { href: "#", "data-anexo": a.id, "data-nome": a.nome },
            }),
          ),
        ),
      ),
    );
  }

  card.querySelectorAll("[data-anexo]").forEach((link) =>
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await Oficina.baixar(
          `/anexo/${link.dataset.anexo}/arquivo`,
          link.dataset.nome,
        );
      } catch (erro) {
        Oficina.mensagem(document.getElementById("meta-erro"), erro.message);
      }
    }),
  );
  const responder = criar("button", {
    classe: "btn btn-responder",
    texto: "Responder",
    attrs: { type: "button" },
  });
  responder.addEventListener("click", () => abrirForm(post));
  card.append(responder);
  return card;
}

btnAddPostagem.addEventListener("click", () => abrirForm(null));
document.getElementById("fechar-meta").addEventListener("click", fecharMeta);
overlayMeta.addEventListener("click", (e) => {
  if (e.target === overlayMeta) fecharMeta();
});

btnConcluir.addEventListener("click", async () => {
  const meta = metas.find((m) => m.id === metaAbertaId);
  if (!meta || !podeGerenciar || btnConcluir.disabled || gravandoMeta) return;
  Oficina.mensagem(document.getElementById("meta-erro"), "");
  btnConcluir.disabled = true;
  try {
    const novo = !meta.concluido;
    const resposta = await API.alterarConclusao(meta.id, novo, meta.versao);
    Object.assign(
      meta,
      resposta?.id
        ? { ...meta, ...adaptarMeta(resposta) }
        : { concluido: novo },
    );
    renderizarMetas(); // atualiza o card por trás da janela
    renderizarMetaAberta();
  } catch (erro) {
    console.error(erro);
    Oficina.mensagem(document.getElementById("meta-erro"), erro.message);
  } finally {
    btnConcluir.disabled = false;
  }
});
btnExcluirMeta.addEventListener("click", async () => {
  const meta = metas.find((item) => item.id === metaAbertaId);
  if (!meta || !podeGerenciar || btnExcluirMeta.disabled || gravandoMeta) return;
  if (!confirm("Excluir esta meta? Esta ação não pode ser desfeita.")) return;
  Oficina.mensagem(document.getElementById("meta-erro"), "");
  btnExcluirMeta.disabled = true;
  gravandoMeta = true;
  try {
    await API.excluir(meta.id);
    const indice = metas.findIndex((item) => item.id === meta.id);
    if (indice >= 0) metas.splice(indice, 1);
    if (focoMetaId === meta.id) {
      focoMetaId = null;
      document.getElementById("foco-meta-aviso").hidden = true;
    }
    renderizarMetas();
    gravandoMeta = false;
    fecharMeta();
    document.getElementById("metas-area").focus();
    Oficina.mensagem(paginaErro, "Meta excluída.", "sucesso");
  } catch (erro) {
    console.error(erro);
    Oficina.mensagem(document.getElementById("meta-erro"), erro.message);
  } finally {
    gravandoMeta = false;
    btnExcluirMeta.disabled = false;
  }
});

/* ---------- 9. FORMULÁRIO DE POSTAGEM ---------- */
selectTipo.replaceChildren(
  ...TIPOS_POSTAGEM.map((t) =>
    criar("option", { texto: ROTULOS_POSTAGEM[t], attrs: { value: t } }),
  ),
);

function abrirForm(respondeA) {
  respondendoAId = respondeA ? respondeA.id : null;
  formPostagem.reset();
  document.getElementById("post-visibilidade").value =
    respondeA?.visualizacao || "TODOS";
  inputAnexos.value = "";
  arquivosSelecionados = [];
  renderizarAnexos();
  formErro.textContent = "";
  formContexto.textContent = respondeA
    ? `Respondendo a “${respondeA.titulo}”`
    : "Nova postagem";
  if (respondeA) inputTitulo.value = `Re: ${respondeA.titulo}`;
  abrirOverlay(overlayForm, inputTitulo);
}

function fecharForm() {
  fecharOverlay(overlayForm);
}

function renderizarAnexos() {
  listaAnexos.replaceChildren(
    ...arquivosSelecionados.map((arq, i) => {
      const remover = criar("button", {
        texto: "×",
        attrs: { type: "button", "aria-label": `Remover ${arq.name}` },
      });
      remover.addEventListener("click", () => {
        arquivosSelecionados.splice(i, 1);
        renderizarAnexos();
      });
      return criar(
        "li",
        { classe: "anexo" },
        criar("span", {
          texto: `📎 ${arq.name} (${formatarTamanho(arq.size)})`,
        }),
        remover,
      );
    }),
  );
}

document
  .getElementById("btn-anexar")
  .addEventListener("click", () => inputAnexos.click());

inputAnexos.addEventListener("change", () => {
  [...inputAnexos.files].forEach((f) => {
    const repetido = arquivosSelecionados.some(
      (a) => a.name === f.name && a.size === f.size,
    );
    if (!repetido) arquivosSelecionados.push(f);
  });
  inputAnexos.value = ""; // permite escolher o mesmo arquivo de novo
  renderizarAnexos();
});

formPostagem.addEventListener("submit", async (e) => {
  e.preventDefault();
  const meta = metas.find((m) => m.id === metaAbertaId);
  if (!meta || btnEnviar.disabled) return;

  if (!inputTitulo.value.trim()) {
    formErro.textContent = "Informe o título da postagem.";
    inputTitulo.focus();
    return;
  }
  if (!inputConteudo.value.trim()) {
    formErro.textContent = "Escreva o conteúdo da postagem.";
    return;
  }

  const dados = {
    titulo: inputTitulo.value.trim(),
    tipo: selectTipo.value,
    conteudoHTML: textoParaHTML(inputConteudo.value),
    respondeA: respondendoAId,
    visualizacao: document.getElementById("post-visibilidade").value,
  };

  btnEnviar.disabled = true;
  formErro.textContent = "";
  try {
    const nova = await API.criarPostagem(meta.id, dados, arquivosSelecionados);
    meta.postagens.push(nova);
    meta.totalPostagens = meta.postagens.length;
    fecharForm();
    renderizarMetas();
    renderizarMetaAberta();
    const primeiro = listaPostagens.firstElementChild;
    if (primeiro && primeiro.scrollIntoView)
      primeiro.scrollIntoView({ block: "nearest" });
  } catch (erro) {
    console.error(erro);
    formErro.textContent = erro.message;
  } finally {
    btnEnviar.disabled = false;
  }
});

document.getElementById("fechar-form").addEventListener("click", fecharForm);
overlayForm.addEventListener("click", (e) => {
  if (e.target === overlayForm) fecharForm();
});

// Esc fecha a janela que estiver por cima
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && (!overlayMeta.hidden || !overlayForm.hidden)) {
    const overlay = !overlayForm.hidden ? overlayForm : overlayMeta;
    const campos = [
      ...overlay.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex="0"]',
      ),
    ].filter(
      (campo) =>
        !campo.disabled && !campo.hidden && campo.getClientRects().length,
    );
    const primeiro = campos[0],
      ultimo = campos[campos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo?.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro?.focus();
    }
    return;
  }
  if (e.key !== "Escape") return;
  if (!overlayForm.hidden) fecharForm();
  else if (!overlayMeta.hidden) fecharMeta();
  else fecharMenuAreas();
});

/* ---------- 10. CARREGAMENTO E CRIAÇÃO DE METAS ---------- */
const novaMetaForm = document.getElementById("nova-meta-form");
const paginaErro = document.getElementById("pagina-erro");
const btnAtualizar = document.getElementById("recarregar");
function atualizarAnteriores() {
  const lista = document.getElementById("meta-anteriores");
  const marcadas = new Set(anterioresSelecionadas());
  lista.replaceChildren();
  metas.forEach((m) => {
    const check = criar("input", {
      attrs: { type: "checkbox", name: "anteriores", value: m.id },
    });
    check.checked = marcadas.has(m.id);
    check.addEventListener("change", filtrarAnteriores);
    const opcao = criar(
      "label",
      { classe: "opcao-conectar" },
      check,
      criar("span", {}, criar("strong", { texto: m.titulo }),
        criar("small", { texto: `${m.area} · ${m.responsavel?.nome || "Equipe"}` })),
    );
    opcao.dataset.busca = `${m.titulo} ${m.area} ${m.responsavel?.nome || "Equipe"}`
      .toLocaleLowerCase("pt-BR");
    lista.append(opcao);
  });
  document.getElementById("busca-anteriores").disabled = !metas.length;
  filtrarAnteriores();
}
function anterioresSelecionadas() {
  return [...document.querySelectorAll("#meta-anteriores input:checked")]
    .map((check) => Number(check.value));
}
function filtrarAnteriores() {
  const busca = document.getElementById("busca-anteriores").value.trim()
    .toLocaleLowerCase("pt-BR");
  const opcoes = [...document.querySelectorAll("#meta-anteriores .opcao-conectar")];
  opcoes.forEach((opcao) => { opcao.hidden = !opcao.dataset.busca.includes(busca); });
  const vazio = document.getElementById("anteriores-vazio");
  vazio.hidden = opcoes.some((opcao) => !opcao.hidden);
  vazio.textContent = opcoes.length
    ? "Nenhuma meta encontrada. Tente outro título, área ou profissional."
    : "Ainda não há metas para conectar. Você pode criar esta sem metas anteriores.";
  const total = anterioresSelecionadas().length;
  document.getElementById("anteriores-contagem").textContent = total
    ? `${total} ${total === 1 ? "meta anterior selecionada" : "metas anteriores selecionadas"}`
    : "Nenhuma meta anterior selecionada.";
}
document.getElementById("busca-anteriores").addEventListener("input", filtrarAnteriores);
const novaMetaArea = document.getElementById("nova-meta-area");
const btnNovaMeta = document.getElementById("abrir-nova-meta");
function atualizarSugestoesAreas() {
  const sugestoes = document.getElementById("areas-aprendizagem-sugeridas");
  const areas = [...new Set(
    metas.map((item) => String(item.area || "").trim()).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sugestoes.replaceChildren(
    ...areas.map((area) => {
      const opcao = document.createElement("option");
      opcao.value = area;
      return opcao;
    }),
  );
}
btnNovaMeta.addEventListener("click", () => {
  if (!podeGerenciar || carregando) return;
  novaMetaArea.open = !novaMetaArea.open;
  btnNovaMeta.setAttribute("aria-expanded", String(novaMetaArea.open));
  if (novaMetaArea.open) document.getElementById("meta-titulo").focus();
});
novaMetaArea.addEventListener("toggle", () =>
  btnNovaMeta.setAttribute("aria-expanded", String(novaMetaArea.open)),
);
document.getElementById("cancelar-nova-meta").addEventListener("click", () => {
  novaMetaArea.open = false;
  btnNovaMeta.focus();
});
async function iniciar() {
  if (carregando) return;
  carregando = true;
  podeGerenciar = false;
  btnNovaMeta.hidden = true;
  novaMetaArea.hidden = true;
  btnAtualizar.disabled = true;
  Oficina.mensagem(paginaErro, "Carregando paciente e metas…", "info");
  try {
    const u = await Oficina.exigirSessao();
    usuarioAtualId = u.id;
    document.getElementById("dados-paciente").href =
      `paciente.html?paciente=${encodeURIComponent(idPacienteAtual)}`;
    if (!/^[1-9]\d*$/.test(idPacienteAtual || ""))
      throw new Error("Abra um paciente pelo painel para ver suas metas.");

    btnConcluir.hidden = u.tipoUsuario !== "PROFISSIONAL";
    document.querySelector(
      '#post-visibilidade option[value="PROFISSIONAIS"]',
    ).hidden = u.tipoUsuario !== "PROFISSIONAL";
    const [paciente, lista] = await Promise.all([
      API.buscarPaciente(idPacienteAtual),
      API.buscarMetas(idPacienteAtual),
    ]);
    preencherPaciente(paciente);
    metas.length = 0;
    lista.forEach((m) => addMeta(m, false));
    atualizarSugestoesAreas();
    podeGerenciar = u.tipoUsuario === "PROFISSIONAL";
    novaMetaArea.hidden = !podeGerenciar;
    btnNovaMeta.hidden = !podeGerenciar;
    Oficina.mensagem(paginaErro, "");
    renderizarMenuAreas();
    renderizarColaboracao();
    renderizarMetas();
    atualizarAnteriores();
    if (metaAbertaId) renderizarMetaAberta();
  } catch (erro) {
    Oficina.mensagem(paginaErro, erro.message);
  } finally {
    carregando = false;
    btnAtualizar.disabled = false;
  }
}
novaMetaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  Oficina.mensagem(paginaErro, "");
  if (!podeGerenciar || carregando) return;
  for (const id of ["meta-titulo", "meta-area", "meta-descricao"])
    document.getElementById(id).value = document
      .getElementById(id)
      .value.trim();
  if (!novaMetaForm.reportValidity()) return;
  Oficina.ocupar(
    novaMetaForm.querySelector("[type=submit]"),
    async () => {
      const dados = {
        titulo: document.getElementById("meta-titulo").value.trim(),
        area: document.getElementById("meta-area").value.trim(),
        conteudoHtml: Oficina.textoHTML(
          document.getElementById("meta-descricao").value,
        ),
        anteriores: anterioresSelecionadas(),
      };
      addMeta(
        meta(
          await Oficina.post(
            `/meta/criar?idPaciente=${idPacienteAtual}`,
            dados,
          ),
        ),
      );
      atualizarSugestoesAreas();
      novaMetaForm.reset();
      atualizarAnteriores();
      novaMetaArea.open = false;
      btnNovaMeta.focus();
      Oficina.mensagem(paginaErro, "Meta salva no servidor.", "sucesso");
    },
    paginaErro,
  );
});
/* Colaboração, edição e navegação do mapa. */
function htmlParaTexto(html) {
  const doc = new DOMParser().parseFromString(
    Oficina.htmlSeguro(html || ""),
    "text/html",
  );
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc
    .querySelectorAll("p,div,li,h1,h2,h3,blockquote")
    .forEach((n) => n.append("\n"));
  return doc.body.textContent.trim();
}
function adaptarMeta(raw) {
  const antiga = metas.find((m) => m.id === raw.id);
  return {
    ...antiga,
    ...meta(raw),
    postagens: antiga?.postagens || [],
    postagensCarregadas: antiga?.postagensCarregadas || false,
  };
}
function substituirMetas(lista) {
  const novas = lista.map(adaptarMeta);
  metas.splice(0, metas.length, ...novas);
  renderizarMenuAreas();
  renderizarColaboracao();
  renderizarMetas();
  atualizarAnteriores();
}
function renderizarColaboracao() {
  const autores = new Map();
  metas.forEach((m) => {
    const p = m.responsavel;
    if (p?.nome) autores.set(String(p.id ?? p.nome), p);
  });
  const colaboradores = new Map(autores);
  metas.forEach((m) => {
    const p = m.atualizadoPor;
    if (p?.nome) colaboradores.set(String(p.id ?? p.nome), p);
  });
  const select = document.getElementById("filtro-autor"),
    atual = select.value;
  select.replaceChildren(
    criar("option", { texto: "Toda a equipe", attrs: { value: "todos" } }),
    ...[...autores].map(([id, p]) =>
      criar("option", { texto: p.nome, attrs: { value: id } }),
    ),
  );
  select.value = autores.has(atual) ? atual : "todos";
  document.getElementById("colab-resumo").textContent = colaboradores.size
    ? `${colaboradores.size} ${colaboradores.size === 1 ? "profissional com metas nesta trilha" : "profissionais construindo esta trilha"}`
    : "Metas compartilhadas do aluno";
  const avatares = document.getElementById("colab-autores");
  avatares.replaceChildren();
  [...colaboradores.values()].slice(0, 6).forEach((p) => {
    const item = criar("span", {
      classe: "colab-avatar",
      attrs: { title: p.nome, "aria-label": p.nome },
    });
    item.append(criarAvatar(p));
    avatares.append(item);
  });
}
function selecionarAba(nome) {
  const meta = metas.find((item) => item.id === metaAbertaId);
  if (nome === "editar" && !podeEditarMeta(meta)) return;
  if (nome !== "conexoes") definirMaximizacaoConexoes(false);
  abaAtual = nome;
  ["visao", "conexoes", "editar"].forEach((n) => {
    document.getElementById("meta-painel-" + n).hidden = n !== nome;
    const botao = document.getElementById("aba-" + n);
    botao.setAttribute("aria-selected", String(n === nome));
    botao.tabIndex = n === nome ? 0 : -1;
  });
  if (nome === "conexoes")
    renderizarConexoesResumo(metas.find((m) => m.id === metaAbertaId));
}
function definirMaximizacaoConexoes(maximizada) {
  janelaMeta.classList.toggle("conexoes-maximizadas", maximizada);
  overlayMeta.classList.toggle("overlay-meta-maximizada", maximizada);
  const botao = document.getElementById("maximizar-conexoes");
  botao.setAttribute("aria-pressed", String(maximizada));
  botao.textContent = maximizada ? "Restaurar conexões" : "Maximizar conexões";
}
document.getElementById("maximizar-conexoes").addEventListener("click", () => {
  definirMaximizacaoConexoes(
    !janelaMeta.classList.contains("conexoes-maximizadas"),
  );
});
function podeEditarMeta(meta) {
  return (
    podeGerenciar &&
    usuarioAtualId != null &&
    meta?.responsavel?.id != null &&
    String(meta.responsavel.id) === String(usuarioAtualId)
  );
}
async function carregarPostagens(m, forcar = false) {
  if (!m || (m.postagensCarregadas && !forcar)) return;
  if (metaAbertaId === m.id) {
    postagensVazio.hidden = false;
    postagensVazio.textContent = "Carregando registros…";
  }
  try {
    const registros = await Oficina.get(`/postagem?idMeta=${m.id}`);
    const atual = metas.find((item) => item.id === m.id);
    if (!atual) return;
    atual.postagens = registros.map(postagem);
    atual.postagensCarregadas = true;
    atual.totalPostagens = registros.length;
    if (metaAbertaId === m.id) renderizarMetaAberta();
  } catch (e) {
    if (metaAbertaId === m.id)
      Oficina.mensagem(
        document.getElementById("meta-erro"),
        "Não foi possível carregar os registros: " + e.message,
      );
  }
}
function renderizarConexoesResumo(m) {
  if (!m) return;
  const resumo = document.getElementById("conexoes-resumo");
  resumo.replaceChildren();
  const pais = metas.filter((a) => (m.anteriores || []).includes(a.id)),
    filhos = metas.filter((a) => (a.anteriores || []).includes(m.id));
  [
    [pais, "Metas anteriores"],
    [filhos, "Metas seguintes"],
  ].forEach(([grupo, titulo]) => {
    const bloco = criar("div", { classe: "grupo-conexoes" });
    bloco.append(criar("h4", { texto: `${titulo} · ${grupo.length}` }));
    if (!grupo.length)
      bloco.append(criar("p", { texto: "Nenhuma conexão nesta direção." }));
    grupo.forEach((item) => {
      const botao = criar(
        "button",
        { classe: "meta-vinculada", attrs: { type: "button" } },
        criar("strong", { texto: item.titulo }),
        criar("span", {
          texto: `${item.area} · ${item.responsavel?.nome || "Equipe"} ${item.concluido ? "· Concluída" : ""}`,
        }),
      );
      botao.addEventListener("click", () => {
        abrirMeta(item.id);
        selecionarAba("conexoes");
      });
      bloco.append(botao);
    });
    resumo.append(bloco);
  });
}
async function abrirEdicao(forcar = false) {
  if (!podeEditarMeta(metas.find((item) => item.id === metaAbertaId)) || gravandoMeta) return;
  if (!forcar && edicaoBase?.id === metaAbertaId) {
    selecionarAba("editar");
    return;
  }
  selecionarAba("editar");
  const id = metaAbertaId;
  edicaoBase = null;
  const botao = document.getElementById("salvar-edicao-meta");
  botao.disabled = true;
  Oficina.mensagem(
    document.getElementById("edicao-meta-erro"),
    "Carregando a versão atual…",
    "info",
  );
  try {
    const raw = await Oficina.get(`/meta/${id}`);
    if (metaAbertaId !== id) return;
    edicaoBase = raw;
    document.getElementById("editar-meta-titulo").value = raw.titulo;
    document.getElementById("editar-meta-area").value = raw.area;
    document.getElementById("editar-meta-descricao").value = htmlParaTexto(
      raw.conteudoHtml,
    );
    document.getElementById("recarregar-edicao-meta").hidden = true;
    Oficina.mensagem(document.getElementById("edicao-meta-erro"), "");
  } catch (e) {
    Oficina.mensagem(document.getElementById("edicao-meta-erro"), e.message);
    document.getElementById("recarregar-edicao-meta").hidden = false;
  } finally {
    botao.disabled = !edicaoBase;
  }
}
async function abrirConexoes() {
  if (!podeEditarMeta(metas.find((item) => item.id === metaAbertaId)) || gravandoMeta) return;
  const id = metaAbertaId,
    botao = document.getElementById("editar-conexoes");
  botao.disabled = true;
  try {
    const lista = await Oficina.get(`/meta?idPaciente=${idPacienteAtual}`);
    if (metaAbertaId !== id) return;
    substituirMetas(lista);
    conexoesBase = metas.map((m) => ({ ...m, anteriores: [...m.anteriores] }));
    const atual = metas.find((m) => m.id === id);
    if (!atual)
      throw new Error("Esta meta não está mais disponível. Atualize a trilha.");
    document.getElementById("conexoes-resumo").hidden = true;
    const form = document.getElementById("form-conexoes");
    form.hidden = false;
    botao.hidden = true;
    Oficina.mensagem(document.getElementById("conexoes-erro"), "");
    document.getElementById("busca-conexoes").value = "";
    ["anteriores", "seguintes"].forEach((dir) => {
      const lista = document.getElementById("conexoes-" + dir);
      lista.replaceChildren();
      conexoesBase
        .filter((m) => m.id !== id)
        .forEach((m) => {
          const check = criar("input", {
            attrs: { type: "checkbox", value: m.id, "data-direcao": dir },
          });
          check.checked =
            dir === "anteriores"
              ? atual.anteriores.includes(m.id)
              : m.anteriores.includes(id);
          const label = criar(
            "label",
            { classe: "opcao-conectar" },
            check,
            criar(
              "span",
              {},
              criar("strong", { texto: m.titulo }),
              criar("small", {
                texto: `${m.area} · ${m.responsavel?.nome || "Equipe"}`,
              }),
            ),
          );
          check.addEventListener("change", preverConexoes);
          lista.append(label);
        });
      if (!lista.children.length)
        lista.append(criar("p", { texto: "Crie outra meta para conectar." }));
    });
    preverConexoes();
  } catch (e) {
    Oficina.mensagem(document.getElementById("meta-erro"), e.message);
    document
      .getElementById("conexoes-resumo")
      .prepend(criar("p", { texto: e.message, classe: "api-mensagem" }));
  } finally {
    botao.disabled = false;
  }
}
function bloquearFormulario(id, bloquear) {
  document
    .getElementById(id)
    .querySelectorAll("input,textarea,select,button")
    .forEach((c) => (c.disabled = bloquear));
}
function conexoesSelecionadas(dir) {
  return [...document.querySelectorAll(`#conexoes-${dir} input:checked`)].map(
    (i) => Number(i.value),
  );
}
function preverConexoes() {
  const anteriores = conexoesSelecionadas("anteriores"),
    seguintes = conexoesSelecionadas("seguintes");
  const aviso = document.getElementById("conexoes-previa"),
    botao = document.getElementById("salvar-conexoes");
  try {
    grafo.projetarConexoes(conexoesBase, metaAbertaId, anteriores, seguintes);
    aviso.textContent = `${anteriores.length} conexões anteriores · ${seguintes.length} conexões seguintes`;
    aviso.dataset.tipo = "info";
    botao.disabled = false;
  } catch (e) {
    aviso.textContent = e.message;
    aviso.dataset.tipo = "erro";
    botao.disabled = true;
  }
}
function fecharConexoes() {
  document.getElementById("editar-conexoes").hidden =
    !podeEditarMeta(metas.find((item) => item.id === metaAbertaId));
  document.getElementById("form-conexoes").hidden = true;
  document.getElementById("conexoes-resumo").hidden = false;
  conexoesBase = null;
}
function dimensoesMapa() {
  const css = window.getComputedStyle?.(document.body),
    valor = (n, padrao) => parseFloat(css?.getPropertyValue(n)) || padrao;
  const l = layoutAtual || { colunas: 1, linhas: 1 };
  return {
    largura:
      l.colunas * (valor("--meta-w", 292) + valor("--gap-x", 54)) -
      valor("--gap-x", 54) +
      2 * valor("--canvas-pad-x", 24),
    altura:
      l.linhas * (valor("--meta-h", 284) + valor("--gap-y", 28)) -
      valor("--gap-y", 28) +
      2 * valor("--canvas-pad-y", 24),
  };
}
function dimensionarMapa() {
  const superficie = document.getElementById("metas-superficie"),
    area = document.getElementById("metas-area");
  area.classList.toggle("modo-lista", modoVisual === "lista");
  document.getElementById("zoom-ferramentas").hidden = modoVisual === "lista";
  document
    .getElementById("modo-mapa")
    .setAttribute("aria-pressed", String(modoVisual === "mapa"));
  document
    .getElementById("modo-lista")
    .setAttribute("aria-pressed", String(modoVisual === "lista"));
  if (modoVisual === "lista" || !metasVisiveis().length) {
    superficie.style.width = "100%";
    superficie.style.height = !metasVisiveis().length ? "290px" : "auto";
    canvas.style.width = "100%";
    canvas.style.height = !metasVisiveis().length ? "290px" : "auto";
    canvas.style.transform = "none";
    return;
  }
  const d = dimensoesMapa();
  canvas.style.width = d.largura + "px";
  canvas.style.minWidth = "0";
  canvas.style.height = d.altura + "px";
  canvas.style.transform = `scale(${escalaMapa})`;
  superficie.style.width =
    Math.max(area.clientWidth, d.largura * escalaMapa) + "px";
  superficie.style.height = d.altura * escalaMapa + "px";
  document.getElementById("zoom-valor").textContent =
    Math.round(escalaMapa * 100) + "%";
}
function mudarEscala(n) {
  const area = document.getElementById("metas-area"),
    ratio = Math.max(0.15, Math.min(1.75, n)) / escalaMapa;
  escalaMapa = Math.max(0.15, Math.min(1.75, n));
  const x =
      (area.scrollLeft + area.clientWidth / 2) * ratio - area.clientWidth / 2,
    y =
      (area.scrollTop + area.clientHeight / 2) * ratio - area.clientHeight / 2;
  dimensionarMapa();
  area.scrollLeft = x;
  area.scrollTop = y;
}
function destacarMeta(id) {
  const grupo = id ? grafo.conectadas(metas, id) : null;
  cardsPorId.forEach((card, n) => {
    card.classList.toggle("atenuada", Boolean(grupo && !grupo.has(n)));
    card.classList.toggle("meta-destaque", n === id);
  });
  svgLinhas
    .querySelectorAll(".linha-meta")
    .forEach((l) =>
      l.classList.toggle(
        "linha-destaque",
        Boolean(
          grupo &&
            grupo.has(Number(l.dataset.origem)) &&
            grupo.has(Number(l.dataset.destino)),
        ),
      ),
    );
}
function limparFiltros() {
  areasSelecionadas.clear();
  focoMetaId = null;
  document.getElementById("busca-metas").value = "";
  document.getElementById("filtro-status").value = "todas";
  document.getElementById("filtro-autor").value = "todos";
  document.getElementById("foco-meta-aviso").hidden = true;
  sincronizarFiltro();
  renderizarMetas();
}
["visao", "conexoes"].forEach((n) =>
  document
    .getElementById("aba-" + n)
    .addEventListener("click", () => selecionarAba(n)),
);
document
  .getElementById("aba-editar")
  .addEventListener("click", () => abrirEdicao());
document
  .getElementById("recarregar-edicao-meta")
  .addEventListener("click", () => abrirEdicao(true));
document
  .getElementById("cancelar-edicao-meta")
  .addEventListener("click", () => {
    edicaoBase = null;
    selecionarAba("visao");
  });
document
  .getElementById("editar-conexoes")
  .addEventListener("click", abrirConexoes);
document
  .getElementById("cancelar-conexoes")
  .addEventListener("click", fecharConexoes);
document.getElementById("busca-conexoes").addEventListener("input", (e) => {
  const termo = e.target.value.toLocaleLowerCase("pt-BR");
  document
    .querySelectorAll(".opcao-conectar")
    .forEach(
      (l) =>
        (l.hidden = !l.textContent.toLocaleLowerCase("pt-BR").includes(termo)),
    );
});
document
  .getElementById("form-conexoes")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (
      !podeEditarMeta(metas.find((item) => item.id === metaAbertaId)) ||
      !conexoesBase ||
      gravandoMeta
    ) return;
    const anteriores = conexoesSelecionadas("anteriores"),
      seguintes = conexoesSelecionadas("seguintes");
    const erro = document.getElementById("conexoes-erro");
    try {
      grafo.projetarConexoes(conexoesBase, metaAbertaId, anteriores, seguintes);
    } catch (e) {
      Oficina.mensagem(erro, e.message);
      return;
    }
    gravandoMeta = true;
    bloquearFormulario("form-conexoes", true);
    const btn = document.getElementById("salvar-conexoes");
    btn.disabled = true;
    try {
      const versoes = Object.fromEntries(
        conexoesBase.map((m) => [m.id, m.versao ?? 0]),
      );
      const lista = await Oficina.patch(`/meta/${metaAbertaId}/conexoes`, {
        anteriores,
        seguintes,
        versoes,
      });
      substituirMetas(lista);
      fecharConexoes();
      renderizarMetaAberta();
      document.getElementById("conexoes-resumo").prepend(
        criar("p", {
          classe: "sucesso-conexoes",
          texto: "Conexões salvas para a equipe.",
        }),
      );
    } catch (e) {
      Oficina.mensagem(
        erro,
        e.message +
          (e.status === 409
            ? " Suas escolhas foram mantidas. Cancele e reabra Gerenciar conexões para carregar a versão atual."
            : ""),
      );
    } finally {
      gravandoMeta = false;
      bloquearFormulario("form-conexoes", false);
      if (conexoesBase) preverConexoes();
    }
  });
document
  .getElementById("form-editar-meta")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (
      !podeEditarMeta(metas.find((item) => item.id === edicaoBase?.id)) ||
      !edicaoBase ||
      gravandoMeta
    ) return;
    const titulo = document.getElementById("editar-meta-titulo").value.trim(),
      area = document.getElementById("editar-meta-area").value.trim(),
      descricao = document.getElementById("editar-meta-descricao").value.trim(),
      erro = document.getElementById("edicao-meta-erro");
    if (!titulo || !area || !descricao) {
      Oficina.mensagem(erro, "Preencha o título, a área e a descrição.");
      return;
    }
    const dto = { titulo, area, versao: edicaoBase.versao ?? 0 };
    if (descricao !== htmlParaTexto(edicaoBase.conteudoHtml))
      dto.conteudoHtml = Oficina.textoHTML(descricao);
    gravandoMeta = true;
    bloquearFormulario("form-editar-meta", true);
    const btn = document.getElementById("salvar-edicao-meta");
    btn.disabled = true;
    try {
      const resposta = await Oficina.patch(`/meta/${edicaoBase.id}`, dto);
      addMeta(adaptarMeta(resposta));
      edicaoBase = null;
      selecionarAba("visao");
      renderizarMetaAberta();
      Oficina.mensagem(
        document.getElementById("meta-erro"),
        "Meta atualizada e disponível para a equipe.",
        "sucesso",
      );
    } catch (e) {
      Oficina.mensagem(
        erro,
        e.message +
          (e.status === 409
            ? " Seus campos foram preservados. Recarregar a versão do servidor substitui os campos atuais."
            : ""),
      );
      document.getElementById("recarregar-edicao-meta").hidden =
        e.status !== 409;
    } finally {
      gravandoMeta = false;
      bloquearFormulario("form-editar-meta", false);
    }
  });
document.getElementById("ver-conexoes-mapa").addEventListener("click", () => {
  const id = metaAbertaId,
    titulo = metas.find((m) => m.id === id)?.titulo;
  fecharMeta();
  limparFiltros();
  focoMetaId = id;
  document.getElementById("foco-meta-aviso").hidden = false;
  document.getElementById("foco-meta-texto").textContent =
    "Conexões de " + titulo;
  modoVisual = "mapa";
  renderizarMetas();
  destacarMeta(id);
  document
    .getElementById("metas-area")
    .scrollIntoView?.({ block: "center", behavior: "smooth" });
});
document
  .getElementById("sair-foco-meta")
  .addEventListener("click", limparFiltros);
document
  .getElementById("limpar-filtros")
  .addEventListener("click", limparFiltros);
["busca-metas", "filtro-status", "filtro-autor"].forEach((id) =>
  document
    .getElementById(id)
    .addEventListener(
      id === "busca-metas" ? "input" : "change",
      renderizarMetas,
    ),
);
["mapa", "lista"].forEach((m) =>
  document.getElementById("modo-" + m).addEventListener("click", () => {
    modoVisual = m;
    dimensionarMapa();
  }),
);
document
  .getElementById("zoom-menos")
  .addEventListener("click", () => mudarEscala(escalaMapa - 0.15));
document
  .getElementById("zoom-mais")
  .addEventListener("click", () => mudarEscala(escalaMapa + 0.15));
document
  .getElementById("zoom-reset")
  .addEventListener("click", () => mudarEscala(1));
document
  .getElementById("zoom-ajustar")
  .addEventListener("click", () =>
    mudarEscala(
      Math.min(
        1,
        document.getElementById("metas-area").clientWidth /
          dimensoesMapa().largura,
      ),
    ),
  );
window.addEventListener("resize", () => {
  dimensionarMapa();
  desenharLinhas();
});
canvas.addEventListener("pointerover", (e) => {
  const card = e.target.closest(".meta-container");
  if (card) destacarMeta(Number(card.dataset.id));
});
canvas.addEventListener("pointerleave", () => destacarMeta(focoMetaId));
const mapaArea = document.getElementById("metas-area");
let arraste = null;
mapaArea.addEventListener(
  "wheel",
  (e) => {
    if (modoVisual === "lista" || e.ctrlKey) return;
    const delta = e.deltaX || e.deltaY;
    const limite = mapaArea.scrollWidth - mapaArea.clientWidth;
    if (!delta || limite <= 0) return;
    if (delta > 0 ? mapaArea.scrollLeft >= limite : mapaArea.scrollLeft <= 0)
      return;
    e.preventDefault();
    mapaArea.scrollLeft += delta;
  },
  { passive: false },
);
mapaArea.addEventListener("pointerdown", (e) => {
  if (
    e.pointerType !== "mouse" ||
    e.button !== 0 ||
    e.target.closest("button,a,input,label,select,textarea")
  )
    return;
  arraste = {
    x: e.clientX,
    y: e.clientY,
    left: mapaArea.scrollLeft,
    top: mapaArea.scrollTop,
  };
  mapaArea.setPointerCapture?.(e.pointerId);
  mapaArea.classList.add("arrastando");
});
mapaArea.addEventListener("pointermove", (e) => {
  if (!arraste) return;
  mapaArea.scrollLeft = arraste.left + arraste.x - e.clientX;
  mapaArea.scrollTop = arraste.top + arraste.y - e.clientY;
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((n) =>
  mapaArea.addEventListener(n, () => {
    arraste = null;
    mapaArea.classList.remove("arrastando");
  }),
);
let sincronizandoEquipe = false;
async function sincronizarEquipe() {
  if (
    carregando ||
    sincronizandoEquipe ||
    gravandoMeta ||
    !podeGerenciar ||
    novaMetaArea.open ||
    !overlayForm.hidden ||
    (abaAtual === "editar" && !overlayMeta.hidden) ||
    conexoesBase ||
    document.visibilityState === "hidden"
  )
    return;
  sincronizandoEquipe = true;
  try {
    const lista = await Oficina.get(`/meta?idPaciente=${idPacienteAtual}`);
    if (
      gravandoMeta ||
      novaMetaArea.open ||
      conexoesBase ||
      (abaAtual === "editar" && !overlayMeta.hidden)
    )
      return;
    const mudou =
      lista.length !== metas.length ||
      lista.some((m) => {
        const atual = metas.find((a) => a.id === m.id);
        return (
          !atual ||
          atual.versao !== m.versao ||
          atual.totalPostagens !== m.totalPostagens
        );
      });
    if (mudou) {
      substituirMetas(lista);
      if (metaAbertaId) {
        await carregarPostagens(
          metas.find((m) => m.id === metaAbertaId),
          true,
        );
        renderizarMetaAberta();
      }
    }
  } catch {
    /* A ação Atualizar continua disponível para tentar novamente. */
  } finally {
    sincronizandoEquipe = false;
  }
}
window.setInterval?.(sincronizarEquipe, 30000);
window.addEventListener("focus", sincronizarEquipe);

document.querySelector(".abas-meta").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const abas = [...document.querySelectorAll(".abas-meta button")].filter(
    (b) => !b.hidden,
  );
  let i = abas.indexOf(document.activeElement);
  i =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? abas.length - 1
        : (i + (e.key === "ArrowLeft" ? -1 : 1) + abas.length) % abas.length;
  e.preventDefault();
  abas[i]?.focus();
  abas[i]?.click();
});
btnAtualizar.addEventListener("click", iniciar);
iniciar();
