/* Metas e postagens persistidas na API do Oficina Aprender. */
const ICONE_PADRAO = "../assets/icons/user-icon.png";
const ROTULO_EXPANDIR = "v v v";
const ROTULO_RECOLHER = "^ ^ ^";
const SVG_NS = "http://www.w3.org/2000/svg";
const ROTULOS_POSTAGEM = {
  REGISTRO_SESSAO: 'Registro de sessão', ORIENTACAO_FAMILIA: 'Orientação à família', ORIENTACAO_ESCOLA: 'Orientação à escola',
  EVOLUCAO: 'Evolução', ATIVIDADE: 'Atividade', RELATORIO: 'Relatório', COMUNICADO: 'Comunicado', DESCRICAO: 'Descrição'
};
const TIPOS_POSTAGEM = Object.keys(ROTULOS_POSTAGEM);
const idPacienteAtual = new URLSearchParams(location.search).get('paciente');
function pessoa(p) { return p ? { nome: p.nome || p.email, imgUrl: p.urlFotoPerfil } : null; }
function postagem(p) { return { ...p, tipo: ROTULOS_POSTAGEM[p.tipoPostagem] || p.tipoPostagem, conteudoHTML: p.conteudoHtml, autor: pessoa(p.autor) }; }
function meta(m) { return { ...m, descricaoHTML: m.conteudoHtml, responsavel: pessoa(m.responsavel), dataUltimaEdit: m.dataAtualizacao, anteriores: m.anteriores || [] }; }
const API = {
  async buscarPaciente(id) {
    const p = await Oficina.get(`/paciente/${id}`); const perfil = p.perfil || {};
    return { fotoUrl: perfil.urlFotoPerfil, nome: perfil.nome || p.email, idade: Oficina.idade(perfil.dataNascimento), condicoes: perfil.condicoes || 'Condição não informada', descricaoHTML: perfil.conteudoHtml || '' };
  },
  async buscarMetas(id) {
    const lista = await Oficina.get(`/meta?idPaciente=${id}`);
    return Promise.all(lista.map(async m => ({ ...meta(m), postagens: (await Oficina.get(`/postagem?idMeta=${m.id}`)).map(postagem) })));
  },
  async criarPostagem(id, dados, arquivos) {
    if (arquivos.some(a => a.size > 10 * 1024 * 1024) || arquivos.reduce((s,a) => s+a.size,0) > 11 * 1024 * 1024) throw new Error('Use arquivos de até 10 MB e até 11 MB no total.');
    const form = new FormData();
    form.append('dados', new Blob([JSON.stringify({ titulo:dados.titulo, tipoPostagem:dados.tipo, conteudoHtml:dados.conteudoHTML, respondeA:dados.respondeA, visualizacao:dados.visualizacao })], {type:'application/json'}));
    arquivos.forEach(a => form.append('arquivos',a));
    return postagem(await Oficina.post(`/postagem/publicar?idMeta=${id}`,form));
  },
  alterarConclusao: (id,concluido) => Oficina.patch(`/meta/${id}`, {concluido})
};

/* ---------- 3. ESTADO E ELEMENTOS ---------- */
const metas = [];                       // todas as metas do paciente
const areasSelecionadas = new Set();    // vazio = todas as áreas
let metaAbertaId = null;
let respondendoAId = null;
let arquivosSelecionados = [];
let cardsPorId = new Map();
let ligacoesAtuais = [];

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
    if (html !== undefined) e.innerHTML = Oficina.htmlSeguro(html);   // só para HTML vindo do servidor (ver nota de segurança)
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    filhos.forEach(f => e.append(f));
    return e;
}

function escaparHTML(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// texto digitado no formulário -> HTML seguro (parágrafos e quebras de linha)
function textoParaHTML(t) {
    return t.trim().split(/\n{2,}/)
        .map(p => `<p>${escaparHTML(p).replace(/\n/g, "<br>")}</p>`).join("");
}

function formatarData(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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
    img.addEventListener("error", () => { img.src = ICONE_PADRAO; }, { once: true });
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
    document.body.classList.toggle("sem-scroll", !overlayMeta.hidden || !overlayForm.hidden);
}


/* ---------- 5. PACIENTE ---------- */
function preencherPaciente(p) {
    Oficina.imagem(campoFoto, p.fotoUrl);
    campoNomeIdade.textContent = `${p.nome} - ${p.idade}`;
    campoCondicoes.textContent = p.condicoes;
    campoDescricao.innerHTML = Oficina.htmlSeguro(p.descricaoHTML);
}

// toggle descrição do paciente
const toggleDescPaciente = document.getElementById("expand-descricao");
const areaPaciente = document.getElementById("paciente-area");
toggleDescPaciente.addEventListener("click", () => {
    campoDescricao.className = campoDescricao.className == "descricao-paciente-collapsed" ? "descricao-paciente-expanded" : "descricao-paciente-collapsed";
    areaPaciente.className = areaPaciente.className == "paciente-collapsed" ? "paciente-expanded" : "paciente-collapsed";
    toggleDescPaciente.textContent = toggleDescPaciente.textContent == ROTULO_EXPANDIR ? ROTULO_RECOLHER : ROTULO_EXPANDIR;
});

document.getElementById("btnVoltar").addEventListener("click", () => history.back());


/* ---------- 6. METAS ---------- */
// adiciona (ou substitui, se o id já existir) uma meta e redesenha
function addMeta(infos, redesenhar = true) {
    const meta = { anteriores: [], postagens: [], concluido: false, ...infos };
    const i = metas.findIndex(m => m.id === meta.id);
    if (i >= 0) metas[i] = meta; else metas.push(meta);
    if (redesenhar) {
        renderizarMenuAreas();
        renderizarMetas();
    }
}

function metasVisiveis() {
    return areasSelecionadas.size === 0 ? metas : metas.filter(m => areasSelecionadas.has(m.area));
}

// ancestrais visíveis mais próximos (mantém as ligações quando o filtro esconde metas do meio)
function paisVisiveis(meta, idsVisiveis, porId) {
    const achados = new Set();
    const vistos = new Set();
    (function subir(ids) {
        ids.forEach(id => {
            if (vistos.has(id)) return;
            vistos.add(id);
            if (idsVisiveis.has(id)) achados.add(id);
            else if (porId.has(id)) subir(porId.get(id).anteriores || []);
        });
    })(meta.anteriores || []);
    return [...achados];
}

// coluna = profundidade (maior caminho até uma meta inicial); linha = perto dos pais
function calcularLayout(visiveis) {
    const ids = new Set(visiveis.map(m => m.id));
    const porId = new Map(metas.map(m => [m.id, m]));
    const pais = new Map(visiveis.map(m => [m.id, paisVisiveis(m, ids, porId)]));

    const nivel = new Map();
    function nivelDe(id, pilha = new Set()) {
        if (nivel.has(id)) return nivel.get(id);
        if (pilha.has(id)) return 0;                       // ciclo (não esperado): ignora
        pilha.add(id);
        const ps = pais.get(id);
        const n = ps.length ? Math.max(...ps.map(p => nivelDe(p, pilha))) + 1 : 0;
        pilha.delete(id);
        nivel.set(id, n);
        return n;
    }
    visiveis.forEach(m => nivelDe(m.id));

    const colunasIds = [];
    visiveis.forEach(m => {
        const n = nivel.get(m.id);
        if (!colunasIds[n]) colunasIds[n] = [];
        colunasIds[n].push(m.id);
    });

    const posicoes = new Map();
    let maxLinha = 0;
    colunasIds.forEach((grupo, coluna) => {
        if (!grupo) return;
        const itens = grupo.map((id, idx) => {
            const ps = pais.get(id);
            const alvo = ps.length
                ? ps.reduce((soma, p) => soma + posicoes.get(p).linha, 0) / ps.length
                : idx;
            return { id, alvo };
        }).sort((a, b) => a.alvo - b.alvo);

        let ultima = -1;
        itens.forEach(({ id, alvo }) => {
            const linha = Math.max(Math.floor(alvo), ultima + 1);
            ultima = linha;
            maxLinha = Math.max(maxLinha, linha);
            posicoes.set(id, { coluna, linha });
        });
    });

    const ligacoes = [];
    pais.forEach((ps, filho) => ps.forEach(p => ligacoes.push([p, filho])));

    return {
        posicoes,
        ligacoes,
        colunas: Math.max(1, colunasIds.length),
        linhas: visiveis.length ? maxLinha + 1 : 1
    };
}

function criarCardMeta(meta) {
    const cabecalho = criar("div", { classe: "meta-header" },
        criarAvatar(meta.responsavel),
        criar("span", { texto: meta.responsavel ? meta.responsavel.nome : "" })
    );
    if (meta.concluido) cabecalho.append(criar("span", { classe: "selo-concluida", texto: "✓ concluída" }));

    const botao = criar("button", { classe: "expand-desc-meta", texto: ROTULO_EXPANDIR,
        attrs: { type: "button", "aria-label": `Expandir meta ${meta.titulo}` } });
    botao.addEventListener("click", () => abrirMeta(meta.id));

    const corpo = criar("div", { classe: "meta" + (meta.concluido ? " concluida" : "") },
        criar("div", { classe: "titulo-meta" },
            criar("h3", { texto: meta.titulo }),
            criar("span", { texto: meta.area })
        ),
        criar("div", { classe: "descricao-meta-container", html: meta.descricaoHTML || "" }),
        botao
    );

    return criar("div", { classe: "meta-container", attrs: { id: `meta-${meta.id}`, "data-id": meta.id } }, cabecalho, corpo);
}

function renderizarMetas() {
    const visiveis = metasVisiveis();
    const layout = calcularLayout(visiveis);

    canvas.querySelectorAll(".meta-container").forEach(c => c.remove());
    cardsPorId = new Map();
    canvas.style.setProperty("--cols", layout.colunas);
    canvas.style.setProperty("--rows", layout.linhas);

    visiveis.forEach(meta => {
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
}

// linhas curvas do lado direito da meta anterior até o lado esquerdo da seguinte
function desenharLinhas() {
    svgLinhas.querySelectorAll("path.linha-meta").forEach(p => p.remove());
    ligacoesAtuais.forEach(([paiId, filhoId]) => {
        const pai = cardsPorId.get(paiId);
        const filho = cardsPorId.get(filhoId);
        if (!pai || !filho) return;
        const caixaPai = pai.querySelector(".meta");
        const caixaFilho = filho.querySelector(".meta");
        const x1 = pai.offsetLeft + pai.offsetWidth;
        const y1 = pai.offsetTop + caixaPai.offsetTop + caixaPai.offsetHeight / 2;
        const x2 = filho.offsetLeft;
        const y2 = filho.offsetTop + caixaFilho.offsetTop + caixaFilho.offsetHeight / 2;
        const dx = (x2 - x1) / 2;
        const linha = document.createElementNS(SVG_NS, "path");
        linha.setAttribute("class", "linha-meta");
        linha.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
        linha.setAttribute("marker-end", "url(#seta)");
        svgLinhas.append(linha);
    });
}

window.addEventListener("resize", desenharLinhas);   // tamanhos em vh mudam com a janela


/* ---------- 7. FILTRO DE ÁREAS ---------- */
let checkTodas = null;
const checksPorArea = new Map();

function criarOpcaoArea(rotulo, marcado, aoMudar) {
    const input = criar("input", { attrs: { type: "checkbox" } });
    input.checked = marcado;
    input.addEventListener("change", () => aoMudar(input));
    const label = criar("label", { classe: "areas-opcao" }, input, criar("span", { texto: rotulo }));
    return { label, input };
}

function sincronizarFiltro() {
    checkTodas.checked = areasSelecionadas.size === 0;
    checksPorArea.forEach((input, area) => { input.checked = areasSelecionadas.has(area); });
    resumoAreas.textContent = areasSelecionadas.size ? [...areasSelecionadas].join(", ") : "Todas as áreas";
}

function renderizarMenuAreas() {
    const areas = [...new Set(metas.map(m => m.area))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    areasSelecionadas.forEach(a => { if (!areas.includes(a)) areasSelecionadas.delete(a); });
    checksPorArea.clear();

    const todas = criarOpcaoArea("Todas as áreas", true, input => {
        if (input.checked) areasSelecionadas.clear();
        sincronizarFiltro();
        renderizarMetas();
    });
    checkTodas = todas.input;

    const opcoes = areas.map(area => {
        const op = criarOpcaoArea(area, false, input => {
            if (input.checked) areasSelecionadas.add(area); else areasSelecionadas.delete(area);
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

document.addEventListener("click", e => {
    if (!filtroAreas.contains(e.target)) fecharMenuAreas();
});


/* ---------- 8. META EXPANDIDA E POSTAGENS ---------- */
function abrirMeta(id) {
    metaAbertaId = id;
    renderizarMetaAberta();
    abrirOverlay(overlayMeta, document.getElementById("fechar-meta"));
}

function fecharMeta() {
    metaAbertaId = null;
    fecharOverlay(overlayMeta);
}

function renderizarMetaAberta() {
    const meta = metas.find(m => m.id === metaAbertaId);
    if (!meta) return;

    expTitulo.textContent = meta.titulo;
    expArea.textContent = meta.area;
    expDescricao.innerHTML = Oficina.htmlSeguro(meta.descricaoHTML);
    btnConcluir.textContent = meta.concluido ? "Reabrir meta" : "Marcar como concluído";
    janelaMeta.classList.toggle("concluida", !!meta.concluido);

    const postagens = [...(meta.postagens || [])]
        .sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));   // mais recentes primeiro
    listaPostagens.replaceChildren(...postagens.map(p => criarCardPostagem(p, meta)));
    postagensVazio.hidden = postagens.length > 0;
}

function criarCardPostagem(post, meta) {
    const card = criar("article", { classe: "postagem", attrs: { "data-id": post.id } },
        criar("div", { classe: "postagem-topo" },
            criarAvatar(post.autor),
            criar("span", { texto: post.autor ? post.autor.nome : "" }),
            criar("span", { classe: "postagem-data", texto: formatarData(post.dataCriacao) })
        )
    );

    const original = post.respondeA != null ? meta.postagens.find(p => p.id === post.respondeA) : null;
    if (original) card.append(criar("div", { classe: "postagem-resposta", texto: `↳ em resposta a “${original.titulo}”` }));

    card.append(
        criar("div", { classe: "postagem-titulo" }, criar("strong", { texto: `${post.titulo} - ${post.tipo}` })),
        criar("div", { classe: "postagem-conteudo", html: post.conteudoHTML || "" })
    );

    if (post.anexos && post.anexos.length) {
        card.append(criar("ul", { classe: "postagem-anexos" }, ...post.anexos.map(a =>
            criar("li", {}, criar("a", {
                classe: "anexo",
                texto: `📎 ${a.nome} (${formatarTamanho(a.tamanhoArquivo)})`,
                attrs: { href: "#", "data-anexo": a.id, "data-nome": a.nome }
            }))
        )));
    }

    card.querySelectorAll('[data-anexo]').forEach(link => link.addEventListener('click', async e => {
        e.preventDefault();
        try { await Oficina.baixar(`/anexo/${link.dataset.anexo}/arquivo`, link.dataset.nome); }
        catch (erro) { Oficina.mensagem(document.getElementById('pagina-erro'), erro.message); }
    }));
    const responder = criar("button", { classe: "btn btn-responder", texto: "Responder", attrs: { type: "button" } });
    responder.addEventListener("click", () => abrirForm(post));
    card.append(responder);
    return card;
}

btnAddPostagem.addEventListener("click", () => abrirForm(null));
document.getElementById("fechar-meta").addEventListener("click", fecharMeta);
overlayMeta.addEventListener("click", e => { if (e.target === overlayMeta) fecharMeta(); });

btnConcluir.addEventListener("click", async () => {
    const meta = metas.find(m => m.id === metaAbertaId);
    if (!meta) return;
    btnConcluir.disabled = true;
    try {
        const novo = !meta.concluido;
        await API.alterarConclusao(meta.id, novo);
        meta.concluido = novo;
        renderizarMetas();          // atualiza o card por trás da janela
        renderizarMetaAberta();
    } catch (erro) {
        console.error(erro);
        Oficina.mensagem(document.getElementById('pagina-erro'), erro.message);
    } finally {
        btnConcluir.disabled = false;
    }
});


/* ---------- 9. FORMULÁRIO DE POSTAGEM ---------- */
selectTipo.replaceChildren(...TIPOS_POSTAGEM.map(t => criar("option", { texto: ROTULOS_POSTAGEM[t], attrs: { value: t } })));

function abrirForm(respondeA) {
    respondendoAId = respondeA ? respondeA.id : null;
    formPostagem.reset();
    inputAnexos.value = "";
    arquivosSelecionados = [];
    renderizarAnexos();
    formErro.textContent = "";
    formContexto.textContent = respondeA ? `Respondendo a “${respondeA.titulo}”` : "Nova postagem";
    if (respondeA) inputTitulo.value = `Re: ${respondeA.titulo}`;
    abrirOverlay(overlayForm, inputTitulo);
}

function fecharForm() {
    fecharOverlay(overlayForm);
}

function renderizarAnexos() {
    listaAnexos.replaceChildren(...arquivosSelecionados.map((arq, i) => {
        const remover = criar("button", { texto: "×", attrs: { type: "button", "aria-label": `Remover ${arq.name}` } });
        remover.addEventListener("click", () => {
            arquivosSelecionados.splice(i, 1);
            renderizarAnexos();
        });
        return criar("li", { classe: "anexo" }, criar("span", { texto: `📎 ${arq.name} (${formatarTamanho(arq.size)})` }), remover);
    }));
}

document.getElementById("btn-anexar").addEventListener("click", () => inputAnexos.click());

inputAnexos.addEventListener("change", () => {
    [...inputAnexos.files].forEach(f => {
        const repetido = arquivosSelecionados.some(a => a.name === f.name && a.size === f.size);
        if (!repetido) arquivosSelecionados.push(f);
    });
    inputAnexos.value = "";        // permite escolher o mesmo arquivo de novo
    renderizarAnexos();
});

formPostagem.addEventListener("submit", async e => {
    e.preventDefault();
    const meta = metas.find(m => m.id === metaAbertaId);
    if (!meta) return;

    if (!inputConteudo.value.trim()) {
        formErro.textContent = "Escreva o conteúdo da postagem.";
        return;
    }

    const dados = {
        titulo: inputTitulo.value.trim(),
        tipo: selectTipo.value,
        conteudoHTML: textoParaHTML(inputConteudo.value),
        respondeA: respondendoAId,
        visualizacao: document.getElementById("post-visibilidade").value
    };

    btnEnviar.disabled = true;
    formErro.textContent = "";
    try {
        const nova = await API.criarPostagem(meta.id, dados, arquivosSelecionados);
        meta.postagens.push(nova);
        fecharForm();
        renderizarMetaAberta();
        const primeiro = listaPostagens.firstElementChild;
        if (primeiro && primeiro.scrollIntoView) primeiro.scrollIntoView({ block: "nearest" });
    } catch (erro) {
        console.error(erro);
        formErro.textContent = erro.message;
    } finally {
        btnEnviar.disabled = false;
    }
});

document.getElementById("fechar-form").addEventListener("click", fecharForm);
overlayForm.addEventListener("click", e => { if (e.target === overlayForm) fecharForm(); });

// Esc fecha a janela que estiver por cima
document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!overlayForm.hidden) fecharForm();
    else if (!overlayMeta.hidden) fecharMeta();
    else fecharMenuAreas();
});


/* ---------- 10. CARREGAMENTO E CRIAÇÃO DE METAS ---------- */
const novaMetaForm = document.getElementById('nova-meta-form');
const paginaErro = document.getElementById('pagina-erro');
const btnAtualizar = document.getElementById('recarregar');
function atualizarAnteriores() {
    const select = document.getElementById('meta-anteriores');
    select.replaceChildren(...metas.map(m => criar('option',{texto:m.titulo,attrs:{value:m.id}})));
}
async function iniciar() {
    btnAtualizar.disabled = true;
    Oficina.mensagem(paginaErro,'Carregando paciente e metas…','info');
    try {
        const u = await Oficina.exigirSessao();
        if (!/^[1-9]\d*$/.test(idPacienteAtual || '')) throw new Error('Abra um paciente pelo painel para ver suas metas.');
        document.getElementById('nova-meta-area').hidden = u.tipoUsuario !== 'PROFISSIONAL';
        btnConcluir.hidden = u.tipoUsuario !== 'PROFISSIONAL';
        document.querySelector('#post-visibilidade option[value="PROFISSIONAIS"]').hidden = u.tipoUsuario !== 'PROFISSIONAL';
        const [paciente, lista] = await Promise.all([API.buscarPaciente(idPacienteAtual), API.buscarMetas(idPacienteAtual)]);
        preencherPaciente(paciente); metas.length = 0; lista.forEach(m => addMeta(m,false));
        Oficina.mensagem(paginaErro,'');
        renderizarMenuAreas(); renderizarMetas(); atualizarAnteriores();
        if (metaAbertaId) renderizarMetaAberta();
    } catch (erro) { Oficina.mensagem(paginaErro,erro.message); }
    finally { btnAtualizar.disabled = false; }
}
novaMetaForm.addEventListener('submit',e => {
    e.preventDefault(); Oficina.mensagem(paginaErro,'');
    Oficina.ocupar(novaMetaForm.querySelector('[type=submit]'),async () => {
        const dados = { titulo:document.getElementById('meta-titulo').value.trim(), area:document.getElementById('meta-area').value.trim(),
            conteudoHtml:Oficina.textoHTML(document.getElementById('meta-descricao').value),
            anteriores:[...document.getElementById('meta-anteriores').selectedOptions].map(o=>Number(o.value)) };
        addMeta(meta(await Oficina.post(`/meta/criar?idPaciente=${idPacienteAtual}`,dados)));
        novaMetaForm.reset(); atualizarAnteriores(); document.getElementById('nova-meta-area').open = false;
    },paginaErro);
});
btnAtualizar.addEventListener('click',iniciar);
iniciar();
