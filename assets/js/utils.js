(function () {
    'use strict';
    const config = window.OFICINA_CONFIG;
    const base = config.apiBase.replace(/\/$/, '');
    const chave = 'oficina.sessao';
    const chaveAvatar = 'oficina.avatar.';
    const tamanhoMaximoAvatarCache = 2 * 1024 * 1024;
    let sessao = null;
    let carregamento = null;
    const imagens = new Map();

    function chaveCacheAvatar(origem) {
        return chaveAvatar + encodeURIComponent(origem);
    }

    function limparCacheAvatar() {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const item = sessionStorage.key(i);
            if (item?.startsWith(chaveAvatar)) sessionStorage.removeItem(item);
        }
    }

    async function blobParaDataUrl(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binario = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binario)}`;
    }
    try {
        sessao = JSON.parse(localStorage.getItem(chave));
    } catch {
        localStorage.removeItem(chave);
    }

    function sair(redirecionar = true) {
        sessao = null;
        carregamento = null;
        localStorage.removeItem(chave);
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        sessionStorage.removeItem('oficina.paciente');
        limparCacheAvatar();
        imagens.forEach(url => URL.revokeObjectURL(url));
        imagens.clear();
        // if (redirecionar) location.replace('login.html');
    }

    function guardarSessao(dados) {
        const usuario = dados?.usuario || dados;
        if (!dados?.token || dados.token === 'undefined' || !usuario?.id) {
            throw new Error('O servidor não retornou uma sessão válida. Atualize o backend.');
        }
        sair(false);
        sessao = {
            token: dados.token,
            usuario: {id: usuario.id, email: usuario.email, tipoUsuario: usuario.tipoUsuario, perfil: usuario.perfil || {}}
        };
        localStorage.setItem(chave, JSON.stringify(sessao));
    }

    async function requisicao(endpoint, {method = 'GET', dados, auth = true, blob = false} = {}) {
        if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw new Error('Rota inválida.');
        const headers = new Headers();
        if (auth) {
            if (!sessao?.token) {
                sair();
                throw new Error('Faça login para continuar.');
            }
            headers.set('Authorization', `Bearer ${sessao.token}`);
        }
        const form = dados instanceof FormData;
        if (dados !== undefined && !form) headers.set('Content-Type', 'application/json');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.timeoutMs);
        try {
            const resposta = await fetch(base + endpoint, {
                method,
                headers,
                body: dados === undefined ? undefined : form ? dados : JSON.stringify(dados),
                signal: controller.signal
            });
            if (resposta.ok && blob) return await resposta.blob();
            const texto = await resposta.text();
            let conteudo = texto;
            try {
                conteudo = texto ? JSON.parse(texto) : null;
            } catch { /* resposta de erro em texto */
            }
            if (!resposta.ok) {
                if (resposta.status === 401 && auth) sair();
                const mensagem = typeof conteudo === 'string' ? conteudo : conteudo?.message || conteudo?.detail;
                const erro = new Error(mensagem || `Não foi possível concluir a operação (${resposta.status}).`);
                erro.status = resposta.status;
                throw erro;
            }
            return conteudo;
        } catch (erro) {
            if (erro.name === 'AbortError') throw new Error('O servidor demorou para responder. Tente novamente.');
            if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Verifique se a API está ligada.');
            throw erro;
        } finally {
            clearTimeout(timer);
        }
    }

    async function exigirSessao() {
        if (!sessao?.token) {
            sair();
            throw new Error('Faça login para continuar.');
        }
        if (!carregamento) {
            carregamento = requisicao('/usuario/me').then(usuario => {
                sessao.usuario = usuario;
                localStorage.setItem(chave, JSON.stringify(sessao));
                return usuario;
            }).catch(erro => {
                carregamento = null;
                throw erro;
            });
        }
        return carregamento;
    }

    function mensagem(elemento, texto, tipo = 'erro') {
        if (!elemento) return;
        elemento.textContent = texto;
        elemento.hidden = !texto;
        elemento.dataset.tipo = tipo;
        elemento.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    }

    function escapar(texto) {
        const e = document.createElement('span');
        e.textContent = texto || '';
        return e.innerHTML;
    }

    function textoHTML(texto) {
        return String(texto || '').trim().split(/\n{2,}/).map(p => `<p>${escapar(p).replace(/\n/g, '<br>')}</p>`).join('');
    }

    function htmlSeguro(html) {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        doc.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,link,meta').forEach(e => e.remove());
        const tags = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'EM', 'B', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A', 'SPAN', 'DIV']);
        [...doc.body.querySelectorAll('*')].reverse().forEach(e => {
            if (!tags.has(e.tagName)) {
                e.replaceWith(...e.childNodes);
                return;
            }
            [...e.attributes].forEach(a => {
                if (e.tagName !== 'A' || a.name !== 'href' || !/^(https?:\/\/|mailto:)/i.test(a.value)) e.removeAttribute(a.name);
            });
            if (e.tagName === 'A') e.setAttribute('rel', 'noopener noreferrer');
        });
        return doc.body.innerHTML;
    }

    function idade(data) {
        if (!data) return 'Idade não informada';
        const nascimento = new Date(data.slice(0, 10) + 'T12:00:00');
        const hoje = new Date();
        let anos = hoje.getFullYear() - nascimento.getFullYear();
        if (hoje.getMonth() < nascimento.getMonth() || (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())) anos--;
        return Number.isFinite(anos) && anos >= 0 ? `${anos} anos` : 'Idade não informada';
    }

    async function imagem(img, origem, cacheTemporario = false) {
        const padrao = '../assets/icons/user-icon.png';
        img.onerror = () => {
            img.onerror = null;
            img.src = padrao;
        };
        if (!origem) {
            img.src = padrao;
            return;
        }
        if (origem.startsWith('/usuario/foto?')) {
            try {
                if (cacheTemporario) {
                    const armazenada = sessionStorage.getItem(chaveCacheAvatar(origem));
                    if (armazenada) {
                        img.src = armazenada;
                        return;
                    }
                }
                img.src = padrao;
                if (!imagens.has(origem)) {
                    const blob = await requisicao(origem, {blob: true});
                    imagens.set(origem, URL.createObjectURL(blob));
                    img.src = imagens.get(origem);
                    if (cacheTemporario && blob.size <= tamanhoMaximoAvatarCache) {
                        const dataUrl = await blobParaDataUrl(blob);
                        try {
                            sessionStorage.setItem(chaveCacheAvatar(origem), dataUrl);
                        } catch (erro) {
                            console.warn('Não foi possível manter a foto em cache nesta aba.', erro);
                        }
                    }
                }
                if (cacheTemporario) {
                    const armazenada = sessionStorage.getItem(chaveCacheAvatar(origem));
                    if (armazenada) {
                        img.src = armazenada;
                        return;
                    }
                }
                img.src = imagens.get(origem);
            } catch { /* mantém o avatar padrão */
            }
        } else if (/^https?:\/\//i.test(origem) || origem.startsWith('../assets/')) img.src = origem;
    }

    async function foto(id, arquivo) {
        if (!arquivo) return;
        if (arquivo.size > 10 * 1024 * 1024) throw new Error('A foto deve ter até 10 MB.');
        const form = new FormData();
        form.append('arquivo', arquivo);
        const origem = `/usuario/foto?id=${id}`;
        const resultado = await requisicao(origem, {method: 'POST', dados: form});
        const url = resultado.urlFotoPerfil;
        sessionStorage.removeItem(chaveCacheAvatar(origem));
        if (url) sessionStorage.removeItem(chaveCacheAvatar(url));
        if (imagens.has(origem)) {
            URL.revokeObjectURL(imagens.get(origem));
            imagens.delete(origem);
        }
        if (url && sessao?.usuario && String(sessao.usuario.id) === String(id)) {
            sessao.usuario.perfil = {
                ...sessao.usuario.perfil,
                urlFotoPerfil: url
            };
            localStorage.setItem(chave, JSON.stringify(sessao));
        }
        const avatar = typeof document === 'undefined'
            ? null
            : document.getElementById('user-img');
        if (avatar && url) void imagem(avatar, url, true);
        return resultado;
    }

    async function baixar(endpoint, nome) {
        const arquivo = await requisicao(endpoint, {blob: true});
        const url = URL.createObjectURL(arquivo);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function ocupar(botao, acao, erro) {
        if (botao.disabled) return;
        botao.disabled = true;
        try {
            await acao();
        } catch (e) {
            mensagem(erro, e.message);
        } finally {
            botao.disabled = false;
        }
    }

    window.Oficina = {
        get: (e) => requisicao(e),
        post: (e, d, op = {}) => requisicao(e, {...op, method: 'POST', dados: d}),
        put: (e, d) => requisicao(e, {method: 'PUT', dados: d}),
        patch: (e, d) => requisicao(e, {method: 'PATCH', dados: d}),
        delete: (e) => requisicao(e, {method: 'DELETE'}),
        login: async (email, senha, codigo) => guardarSessao(await requisicao('/login', {
            method: 'POST',
            dados: {email, senha, ...(codigo ? {codigo} : {})},
            auth: false
        })),
        guardarSessao,
        exigirSessao,
        sair,
        mensagem,
        ocupar,
        htmlSeguro,
        textoHTML,
        escapar,
        idade,
        imagem,
        foto,
        baixar,
        usuario: () => sessao?.usuario
    };
    window.navegarCom = (botao, destino) => botao?.addEventListener('click', () => {
        location.href = destino;
    });
    window.toggleSenha = (botao, input) => {
        if (!botao || !input) return;
        botao.textContent = '👁️';
        botao.setAttribute('aria-label', 'Mostrar senha');
        botao.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
            botao.setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
        });
    };
})();
