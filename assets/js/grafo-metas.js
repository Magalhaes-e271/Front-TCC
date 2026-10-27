/* Operações sobre o grafo de metas, sem depender da interface. */
(function (global) {
  "use strict";
  function indexar(metas) {
    return new Map(metas.map((m) => [Number(m.id), m]));
  }
  function filhos(metas) {
    const mapa = new Map(metas.map((m) => [Number(m.id), []]));
    metas.forEach((m) =>
      (m.anteriores || []).forEach((id) =>
        mapa.get(Number(id))?.push(Number(m.id)),
      ),
    );
    return mapa;
  }
  function percorrer(inicio, vizinhos) {
    const vistos = new Set(),
      fila = [Number(inicio)];
    while (fila.length) {
      const id = fila.pop();
      if (vistos.has(id)) continue;
      vistos.add(id);
      fila.push(...(vizinhos.get(id) || []));
    }
    return vistos;
  }
  function conectadas(metas, id) {
    const pais = new Map(
      metas.map((m) => [Number(m.id), (m.anteriores || []).map(Number)]),
    );
    return new Set([...percorrer(id, pais), ...percorrer(id, filhos(metas))]);
  }
  function temCiclo(metas) {
    const descendentes = filhos(metas),
      graus = new Map(
        metas.map((m) => [Number(m.id), (m.anteriores || []).length]),
      );
    const fila = [...graus.keys()].filter((id) => graus.get(id) === 0);
    let total = 0;
    for (let i = 0; i < fila.length; i++) {
      const id = fila[i];
      total++;
      for (const filho of descendentes.get(id) || []) {
        graus.set(filho, graus.get(filho) - 1);
        if (!graus.get(filho)) fila.push(filho);
      }
    }
    return total !== metas.length;
  }
  function projetarConexoes(metas, id, anteriores, seguintes) {
    const numero = Number(id),
      pais = new Set(anteriores.map(Number)),
      depois = new Set(seguintes.map(Number));
    const porId = indexar(metas);
    if (pais.has(numero) || depois.has(numero))
      throw new Error("Uma meta não pode ser conectada a si mesma.");
    if ([...pais, ...depois].some((n) => !porId.has(n)))
      throw new Error("Selecione somente metas deste aluno.");
    if (pais.size > 100 || depois.size > 100)
      throw new Error("Use até 100 conexões em cada direção.");
    const resultado = metas.map((m) => {
      if (Number(m.id) === numero) return { ...m, anteriores: [...pais] };
      const lista = new Set((m.anteriores || []).map(Number));
      if (depois.has(Number(m.id))) lista.add(numero);
      else lista.delete(numero);
      if (lista.size > 100)
        throw new Error("Uma meta pode ter até 100 conexões anteriores.");
      return { ...m, anteriores: [...lista] };
    });
    if (temCiclo(resultado))
      throw new Error(
        "Essa conexão formaria um ciclo. Uma meta não pode voltar a depender de si mesma.",
      );
    const novas = indexar(resultado);
    if (
      resultado.some(
        (m) =>
          m.concluido && m.anteriores.some((p) => !novas.get(p)?.concluido),
      )
    )
      throw new Error(
        "Uma meta concluída não pode depender de uma meta em andamento. Reabra a meta antes de conectar.",
      );
    return resultado;
  }
  function layout(todas, visiveis) {
    const porId = indexar(todas),
      ids = new Set(visiveis.map((m) => Number(m.id))),
      pais = new Map(),
      indiretas = new Set();
    visiveis.forEach((m) => {
      const encontrados = new Set(),
        vistos = new Set(),
        fila = [...(m.anteriores || [])].map(Number);
      while (fila.length) {
        const id = fila.pop();
        if (vistos.has(id)) continue;
        vistos.add(id);
        if (ids.has(id)) {
          encontrados.add(id);
          if (!(m.anteriores || []).includes(id))
            indiretas.add(`${id}:${m.id}`);
        } else fila.push(...(porId.get(id)?.anteriores || []).map(Number));
      }
      pais.set(Number(m.id), [...encontrados]);
    });
    const graus = new Map([...pais].map(([id, ps]) => [id, ps.length])),
      niveis = new Map(),
      descendentes = new Map([...ids].map((id) => [id, []]));
    pais.forEach((ps, id) => ps.forEach((p) => descendentes.get(p)?.push(id)));
    const fila = [...ids].filter((id) => !graus.get(id));
    fila.forEach((id) => niveis.set(id, 0));
    for (let i = 0; i < fila.length; i++) {
      const id = fila[i];
      for (const f of descendentes.get(id) || []) {
        niveis.set(f, Math.max(niveis.get(f) || 0, niveis.get(id) + 1));
        graus.set(f, graus.get(f) - 1);
        if (!graus.get(f)) fila.push(f);
      }
    }
    const colunas = [];
    ids.forEach((id) => {
      const n = niveis.get(id) || 0;
      (colunas[n] ||= []).push(id);
    });
    const posicoes = new Map();
    let maxLinha = 0;
    colunas.forEach((grupo, coluna) => {
      const alvo = (id) => {
        const ps = (pais.get(id) || []).filter((p) => posicoes.has(p));
        return ps.length
          ? ps.reduce((s, p) => s + posicoes.get(p).linha, 0) / ps.length
          : grupo.indexOf(id);
      };
      grupo.sort((a, b) => alvo(a) - alvo(b) || a - b);
      let anterior = -1;
      grupo.forEach((id) => {
        const linha = Math.max(anterior + 1, Math.round(alvo(id)));
        posicoes.set(id, { coluna, linha });
        anterior = linha;
        maxLinha = Math.max(maxLinha, linha);
      });
    });
    const ligacoes = [];
    pais.forEach((ps, f) => ps.forEach((p) => ligacoes.push([p, f])));
    return {
      posicoes,
      ligacoes,
      indiretas,
      colunas: Math.max(1, colunas.length),
      linhas: visiveis.length ? maxLinha + 1 : 1,
    };
  }
  const api = {
    indexar,
    filhos,
    conectadas,
    temCiclo,
    projetarConexoes,
    layout,
  };
  global.GrafoMetas = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
