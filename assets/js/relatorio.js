(async () => {
  'use strict';
  const el=id=>document.getElementById(id);const id=new URLSearchParams(location.search).get('paciente');
  const criar=(tag,texto,classe)=>{const e=document.createElement(tag);if(texto)e.textContent=texto;if(classe)e.className=classe;return e;};
  const data=valor=>new Date(valor).toLocaleString('pt-BR');
  el('imprimir-relatorio').addEventListener('click',()=>window.print());
  try {
    if(!/^[1-9]\d*$/.test(id||''))throw new Error('Selecione um paciente para gerar o relatório.');
    await Oficina.exigirSessao();const paciente=await Oficina.get(`/paciente/${id}`);const metas=await Oficina.get(`/meta?idPaciente=${id}`);
    const publicacoes=await Promise.all(metas.map(m=>Oficina.get(`/postagem?idMeta=${m.id}`)));
    el('voltar-metas').href=`metas.html?paciente=${id}`;el('relatorio-paciente').textContent=paciente.perfil?.nome||paciente.email;
    el('relatorio-resumo').textContent=`${metas.filter(m=>m.concluido).length} de ${metas.length} metas concluídas`;
    el('relatorio-emissao').textContent=`Emitido em ${data(new Date())}`;
    el('relatorio-metas').replaceChildren(...metas.map((m,i)=>{
      const section=criar('section',null,'relatorio-meta');section.append(criar('h2',m.titulo),criar('p',`${m.area} · ${m.concluido?'Concluída':'Em acompanhamento'}`));
      const descricao=criar('div',null,'relatorio-conteudo');descricao.innerHTML=Oficina.htmlSeguro(m.conteudoHtml);section.append(descricao);
      if(!publicacoes[i].length)section.append(criar('p','Nenhuma postagem nesta meta.'));
      publicacoes[i].forEach(p=>{const artigo=criar('article',null,'relatorio-post');artigo.append(criar('h3',p.titulo),criar('p',`${p.autor?.nome||'Equipe'} · ${data(p.dataCriacao)}${p.visualizacao==='PROFISSIONAIS'?' · Equipe profissional':''}`,'relatorio-data'));
        const texto=criar('div',null,'relatorio-conteudo');texto.innerHTML=Oficina.htmlSeguro(p.conteudoHtml);artigo.append(texto);
        if(p.anexos?.length)artigo.append(criar('p','Anexos: '+p.anexos.map(a=>a.nome).join(', ')));section.append(artigo);});
      return section;
    }));el('relatorio-conteudo').hidden=false;el('imprimir-relatorio').disabled=false;
  } catch(e){Oficina.mensagem(el('pagina-erro'),e.message);}
})();
