import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
env.allowLocalModels = false;

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
let generator = null;
let loadingPromise = null;


function buildIaPrompt(){
  const ud = window.getUserData();
  const t = ud.treinos||[];
  const resumoTreinos = t.slice(-20).map(tr=>{
    const s=tr.stats||{};
    const saldo=s.saldoBJJ ?? window.calcSaldoBJJ?.(s) ?? 0;
    return `- ${tr.data} | tipo: ${tr.tipo} | intensidade: ${tr.intensidade}/10 | fin: ${s.finAp||0}/${s.finSf||0} | quedas: ${s.quedas||0}/${s.quedasSf||0} | passagens: ${s.guard||0}/${s.guardSf||0} | raspagens: ${s.rasp||0}/${s.raspSf||0} | montadas: ${s.montada||0}/${s.montadaSf||0} | costas: ${s.costas||0}/${s.costasSf||0} | saldo de pontos: ${saldo}`;
  }).join('\n');
  return `Você é um treinador de Jiu-Jitsu analisando os dados de um aluno chamado ${ud.profile.nome||'Atleta'}, faixa ${ud.profile.faixa}, com ${ud.profile.anos||0} anos de prática.

Treinos recentes:
${resumoTreinos || 'Nenhum treino registrado ainda.'}

Streak atual: ${window.calcStreak(t)} dias. XP total: ${ud.xp||0}.

Escreva em português, em no máximo 120 palavras, uma análise curta com: 1 ponto forte real baseado nos números acima, 1 ponto de melhoria real, e 1 recomendação prática para a próxima semana. Texto corrido, sem listas, sem markdown.`;
}

async function loadLocalAI(){
  if(generator) return generator;
  if(loadingPromise) return loadingPromise;
  const statusEl = document.getElementById('ia-local-status');
  if(statusEl){ statusEl.style.display='block'; statusEl.textContent='Preparando o download do modelo local...'; }
  loadingPromise = pipeline('text-generation', MODEL_ID, {
    dtype: 'q4',
    progress_callback: (p)=>{
      if(!statusEl) return;
      if(p.status==='progress'){
        const pct = p.total ? Math.round((p.loaded/p.total)*100) : Math.round(p.progress||0);
        statusEl.textContent = `Baixando modelo local (1ª vez só): ${p.file||''} — ${pct}%`;
      } else if(p.status==='ready' || p.status==='done'){
        statusEl.textContent = 'Modelo carregado. Gerando análise...';
      }
    }
  }).then(g=>{ generator=g; return g; });
  return loadingPromise;
}

window.gerarAnaliseIA = async function(){
  const ud = window.getUserData();
  const t = ud.treinos||[];
  if(t.length<2){ window.toast('Registre pelo menos 2 treinos para uma análise melhor.','error'); return; }

  const btn = document.getElementById('ia-real-btn');
  const resultBox = document.getElementById('ia-real-result');
  const emptyBox = document.getElementById('ia-real-empty');
  const statusEl = document.getElementById('ia-local-status');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Processando...';
  emptyBox.style.display = 'none';
  resultBox.style.display = 'block';
  resultBox.textContent = 'Carregando IA local no seu navegador (pode levar um tempo na primeira vez)...';

  try{
    const gen = await loadLocalAI();
    const prompt = buildIaPrompt();
    const messages = [{ role:'user', content: prompt }];
    if(statusEl) statusEl.textContent = 'Gerando análise com o modelo local...';
    const output = await gen(messages, { max_new_tokens: 220, temperature: 0.7, do_sample: true });
    let texto = '';
    const last = Array.isArray(output) ? output[0] : output;
    const genText = last?.generated_text;
    if(Array.isArray(genText)){
      const lastMsg = genText[genText.length-1];
      texto = (lastMsg?.content || '').trim();
    } else if(typeof genText === 'string'){
      texto = genText.replace(prompt,'').trim();
    }
    resultBox.textContent = texto || 'A IA local não retornou texto. Tente novamente.';
    if(statusEl) statusEl.style.display='none';
    window.toast('Análise gerada pela IA local!');
  }catch(err){
    resultBox.textContent = 'Não foi possível rodar a IA local: '+(err?.message||err)+'\n\nVerifique sua conexão (necessária só para o primeiro download) e se o navegador suporta WebAssembly/WebGPU.';
    window.toast('Erro ao rodar a IA local.','error');
  }finally{
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-sparkles"></i> Carregar e gerar análise';
  }
};


function getSpeechRecognitionCtor(){
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

let recognitionAtivo = null;
let transcricaoAcumulada = '';
let narracaoLigada = false;

function buildExtractPrompt(transcricao){
  return `Você recebe o relato falado de um treino de Jiu-Jitsu e devolve APENAS um objeto JSON, sem texto antes ou depois, sem markdown.

Campos do JSON:
tipo: "tecnica", "sparring", "competicao" ou "fisico"
intensidade: numero de 1 a 10
parceiro: nome do parceiro de treino ou ""
obs: resumo curto do relato em uma frase
notaProfPos: uma destas opcoes ou "": "Guarda Fechada","Meia Guarda","Montada","Costas","50/50","Guarda Aberta","Queda","Passagem","Raspagem"
notaProf: o que o professor corrigiu, ou ""
finAp: quantas finalizacoes o atleta aplicou
finSf: quantas finalizacoes o atleta sofreu
quedas: quedas aplicadas
quedasSf: quedas sofridas
guard: passagens de guarda aplicadas
guardSf: passagens de guarda sofridas
rasp: raspagens aplicadas
raspSf: raspagens sofridas
montada: montadas aplicadas
montadaSf: montadas sofridas
costas: pegadas de costas aplicadas
costasSf: pegadas de costas sofridas
submissoesAp: lista com o nome de cada finalizacao aplicada
submissoesSf: lista com o nome de cada finalizacao sofrida

Exemplo de relato: "hoje foi treino de sparring, rolei bem, apliquei um triangulo e uma kimura, mas apanhei de mata leao, professor corrigiu minha postura na guarda fechada"
Exemplo de resposta: {"tipo":"sparring","intensidade":7,"parceiro":"","obs":"treino de sparring com boa performance","notaProfPos":"Guarda Fechada","notaProf":"postura na guarda fechada","finAp":2,"finSf":1,"quedas":0,"quedasSf":0,"guard":0,"guardSf":0,"rasp":0,"raspSf":0,"montada":0,"montadaSf":0,"costas":0,"costasSf":0,"submissoesAp":["Triangulo","Kimura"],"submissoesSf":["Mata Leao"]}

Relato: "${transcricao}"
Resposta:`;
}

function setScoreVal(id, v){
  const el = document.getElementById(id);
  if(!el) return;
  const n = Math.max(0, Math.min(99, parseInt(v) || 0));
  el.value = n;
}

function aplicarTipoNarrado(t){
  const ordem = ['tecnica','sparring','competicao','fisico'];
  if(!ordem.includes(t)) return;
  const btns = document.querySelectorAll('#screen-registro .type-btn');
  const idx = ordem.indexOf(t);
  if(btns[idx]) window.selectType(btns[idx], t);
}

function aplicarSubmissoesNarradas(lista, which){
  const inputId = which === 'ap' ? 'sub-tag-ap-input' : 'sub-tag-sf-input';
  const inp = document.getElementById(inputId);
  if(!inp) return;
  (lista || []).forEach(nome=>{
    if(!nome) return;
    inp.value = nome;
    window.addSubTag(which);
  });
}

function aplicarDadosNarrados(dados){
  if(dados.tipo) aplicarTipoNarrado(dados.tipo);
  if(typeof dados.intensidade === 'number'){
    const n = Math.max(1, Math.min(10, Math.round(dados.intensidade)));
    document.getElementById('intRange').value = n;
    window.updateIntColor(n);
  }
  if(dados.parceiro) document.getElementById('reg-parceiro').value = dados.parceiro;
  if(dados.obs) document.getElementById('reg-obs').value = dados.obs;
  if(dados.notaProf) document.getElementById('reg-nota-prof').value = dados.notaProf;
  if(dados.notaProfPos){
    const sel = document.getElementById('reg-nota-pos');
    const opt = Array.from(sel.options).find(o=>o.value === dados.notaProfPos);
    if(opt) sel.value = dados.notaProfPos;
  }
  setScoreVal('r-fin-ap', dados.finAp);
  setScoreVal('r-fin-sf', dados.finSf);
  setScoreVal('r-quedas', dados.quedas);
  setScoreVal('r-quedas-sf', dados.quedasSf);
  setScoreVal('r-guard', dados.guard);
  setScoreVal('r-guard-sf', dados.guardSf);
  setScoreVal('r-rasp', dados.rasp);
  setScoreVal('r-rasp-sf', dados.raspSf);
  setScoreVal('r-montada', dados.montada);
  setScoreVal('r-montada-sf', dados.montadaSf);
  setScoreVal('r-costas', dados.costas);
  setScoreVal('r-costas-sf', dados.costasSf);
  aplicarSubmissoesNarradas(dados.submissoesAp, 'ap');
  aplicarSubmissoesNarradas(dados.submissoesSf, 'sf');
  window.updateSaldoPreview();
}

function iniciarNarracao(){
  const SR = getSpeechRecognitionCtor();
  const btn = document.getElementById('narracao-btn');
  const status = document.getElementById('narracao-status');
  const preview = document.getElementById('narracao-preview');
  if(!SR){
    window.toast('Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge.','error');
    return;
  }
  transcricaoAcumulada = '';
  preview.style.display = 'block';
  preview.textContent = '';
  status.textContent = 'Ouvindo...';
  btn.innerHTML = '<i class="ti ti-player-stop" style="font-size:13px"></i> Parar e preencher';
  btn.style.background = 'var(--red-dim)';
  btn.style.borderColor = 'var(--red)';
  btn.style.color = 'var(--red)';

  const rec = new SR();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e)=>{
    let interim = '';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t = e.results[i][0].transcript;
      if(e.results[i].isFinal) transcricaoAcumulada += t + ' ';
      else interim += t;
    }
    preview.textContent = transcricaoAcumulada + interim;
  };
  rec.onerror = (e)=>{
    window.toast('Erro no microfone: '+e.error,'error');
    pararNarracao(false);
  };
  rec.onend = ()=>{
    if(narracaoLigada) rec.start();
  };
  narracaoLigada = true;
  recognitionAtivo = rec;
  rec.start();
}

async function pararNarracao(processar){
  narracaoLigada = false;
  if(recognitionAtivo) recognitionAtivo.stop();
  recognitionAtivo = null;
  const btn = document.getElementById('narracao-btn');
  const status = document.getElementById('narracao-status');
  btn.innerHTML = '<i class="ti ti-microphone" style="font-size:13px"></i> Iniciar narração';
  btn.style.background = '';
  btn.style.borderColor = '';
  btn.style.color = '';
  if(!processar || !transcricaoAcumulada.trim()){
    status.textContent = '';
    return;
  }
  status.textContent = 'Processando com IA local...';
  btn.disabled = true;
  try{
    const gen = await loadLocalAI();
    const prompt = buildExtractPrompt(transcricaoAcumulada.trim());
    const output = await gen([{ role:'user', content: prompt }], { max_new_tokens: 260, temperature: 0.2, do_sample: false });
    const last = Array.isArray(output) ? output[0] : output;
    const genText = last?.generated_text;
    let texto = '';
    if(Array.isArray(genText)){
      const lastMsg = genText[genText.length-1];
      texto = (lastMsg?.content || '').trim();
    } else if(typeof genText === 'string'){
      texto = genText.replace(prompt,'').trim();
    }
    const match = texto.match(/\{[\s\S]*\}/);
    if(!match) throw new Error('resposta sem JSON válido');
    const dados = JSON.parse(match[0]);
    aplicarDadosNarrados(dados);
    status.textContent = 'Formulário preenchido pela IA. Confira antes de salvar.';
    window.toast('Preenchido pela IA local! Revise os campos.');
  }catch(err){
    status.textContent = 'Não foi possível interpretar a narração: '+(err?.message||err);
    window.toast('Erro ao processar a narração.','error');
  }finally{
    btn.disabled = false;
  }
}

window.toggleNarracao = function(){
  if(narracaoLigada) pararNarracao(true);
  else iniciarNarracao();
};

if(!getSpeechRecognitionCtor()){
  const btnNarracao = document.getElementById('narracao-btn');
  if(btnNarracao){
    btnNarracao.disabled = true;
    btnNarracao.title = 'Reconhecimento de voz não suportado neste navegador';
  }
}
