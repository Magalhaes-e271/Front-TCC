(async () => {
  const erro = document.getElementById('pagina-erro');
  const chave = 'oficina.paciente';
  const ler = () => { try { return JSON.parse(sessionStorage.getItem(chave)) || {}; } catch { return {}; } };
  const guardar = d => { try { sessionStorage.setItem(chave,JSON.stringify(d)); } catch { throw new Error('A foto é muito grande para continuar. Escolha uma foto menor.'); } };
  try {
    const u = await Oficina.exigirSessao();
    if (u.tipoUsuario !== 'PROFISSIONAL') throw new Error('Só profissionais podem cadastrar pacientes.');
    const dados = ler();
    const form = document.getElementById('patientForm');
    if (form) {
      ['nome','dataNascimento','email','celular'].forEach(id => { document.getElementById(id).value = dados[id] || ''; });
      document.getElementById('dataNascimento').max = new Date().toLocaleDateString('en-CA');
      form.addEventListener('submit', e => {
        e.preventDefault(); Oficina.mensagem(erro,'');
        Oficina.ocupar(form.querySelector('[type=submit]'), async () => {
          const novos = { ...ler(), ...Object.fromEntries(['nome','dataNascimento','email','celular'].map(id => [id,document.getElementById(id).value.trim()])) };
          const file = document.getElementById('foto-paciente').files[0];
          if (file) {
            if (file.size > 2 * 1024 * 1024) throw new Error('Use uma foto de até 2 MB.');
            novos.foto = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Não foi possível ler a foto.')); r.readAsDataURL(file); });
            novos.fotoNome = file.name;
          }
          guardar(novos); location.href = 'descreve_paciente.html';
        },erro);
      });
    } else {
      if (!dados.nome) { location.replace('criar_paciente.html'); return; }
      document.getElementById('condicao').value = dados.condicoes || '';
      document.getElementById('problemas').value = dados.problemas || '';
      const form = document.getElementById('describePatientForm');
      form.addEventListener('submit',e => {
        e.preventDefault(); Oficina.mensagem(erro,'');
        Oficina.ocupar(form.querySelector('[type=submit]'),async () => {
          guardar({ ...ler(), condicoes: document.getElementById('condicao').value.trim(), problemas: document.getElementById('problemas').value.trim() });
          location.href = 'adicione_profissional.html?cadastro=1';
        },erro);
      });
    }
  } catch (e) { Oficina.mensagem(erro,e.message); }
})();
