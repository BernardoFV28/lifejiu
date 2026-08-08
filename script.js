const STORE = {
  get:(k)=>{try{return JSON.parse(localStorage.getItem('lj_'+k))}catch{return null}},
  set:(k,v)=>{
    try{
      localStorage.setItem('lj_'+k, JSON.stringify(v));
      return true;
    }catch(err){
      console.error('Falha ao salvar no localStorage:', err);
      if(typeof toast==='function') toast('Erro ao salvar — o armazenamento do navegador pode estar cheio.','error');
      return false;
    }
  },
  del:(k)=>localStorage.removeItem('lj_'+k)
};
window.STORE = STORE;

const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
const CLOUD_MODE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let supaClient = null;
let supaUser = null;
const supaReady = (async () => {
  if (!CLOUD_MODE) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supaClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Falha ao carregar Supabase — app vai operar em modo local:', e);
  }
})();

let syncTimer = null;
let lastSyncAt = null;
function scheduleAutoSync(ud) {
  if (!CLOUD_MODE || !supaClient || !supaUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushRemoteData(ud).catch(err => console.warn('Auto-sync falhou:', err)), 1200);
}
async function pushRemoteData(ud) {
  if (!supaClient || !supaUser) return;
  const agora = new Date().toISOString();
  const { error } = await supaClient.from('lifejiu_data').upsert({ user_id: supaUser.id, payload: ud, updated_at: agora });
  if (error) throw error;
  const stats = computeUserStats(ud);
  const { error: errStats } = await supaClient.from('lifejiu_public_stats').upsert({
    user_id: supaUser.id, nome: stats.nome, faixa: stats.faixa, academia: stats.academia,
    xp: stats.xp, streak: stats.streak, treinos_semana: stats.treinosSemana, updated_at: agora
  });
  if (errStats) throw errStats;
  lastSyncAt = new Date();
  updateSyncStatusUI();
}
async function pullRemoteData() {
  if (!supaClient || !supaUser) return null;
  const { data, error } = await supaClient.from('lifejiu_data').select('payload,updated_at').eq('user_id', supaUser.id).maybeSingle();
  if (error) throw error;
  return data || null;
}
function updateSyncStatusUI() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (!CLOUD_MODE) { el.textContent = 'Sincronização na nuvem não configurada neste app.'; return; }
  if (!supaUser) { el.textContent = 'Não conectado.'; return; }
  el.textContent = lastSyncAt
    ? 'Sincronizado em ' + lastSyncAt.toLocaleString('pt-BR') + '.'
    : 'Conectado — sincronizando...';
}
window.forceSyncNow = async function () {
  if (!CLOUD_MODE || !supaUser) { toast('Sincronização na nuvem não está configurada.', 'error'); return; }
  try { await pushRemoteData(getUserData()); toast('Dados sincronizados com sucesso!'); }
  catch (err) { toast('Erro ao sincronizar: ' + (err?.message || err), 'error'); }
};

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
window.escapeHtml = escapeHtml;
/* ===== Registro de modalidades (multiesportivo) =====
   Para adicionar um novo esporte no futuro, basta acrescentar uma
   nova chave aqui — nenhum outro arquivo/função precisa mudar. */
const SPORTS_DB = {
  'jiu-jitsu':{ nome:'Jiu-Jitsu', icone:'ti-yoga', cor:'#D72638', corDeep:'#A81D29', corBright:'#FF3347', corDim:'rgba(215,38,56,.12)', corGlow:'rgba(215,38,56,.25)', temGraduacao:true,
    graduacoes:[{nome:'Branca',cor:'#F5EFEF'},{nome:'Azul',cor:'#2E6FE0'},{nome:'Roxa',cor:'#7B3FA0'},{nome:'Marrom',cor:'#6B4226'},{nome:'Preta',cor:'#111111'}] },
  'judo':{ nome:'Judô', icone:'ti-friends', cor:'#2E6FE0', corDeep:'#1F4FAE', corBright:'#5B93F5', corDim:'rgba(46,111,224,.12)', corGlow:'rgba(46,111,224,.25)', temGraduacao:true,
    graduacoes:[{nome:'Branca',cor:'#F5EFEF'},{nome:'Amarela',cor:'#F4B942'},{nome:'Laranja',cor:'#E8792A'},{nome:'Verde',cor:'#2FA84F'},{nome:'Azul',cor:'#2E6FE0'},{nome:'Marrom',cor:'#6B4226'},{nome:'Preta',cor:'#111111'}] },
  'karate':{ nome:'Karatê', icone:'ti-hand-stop', cor:'#E8792A', corDeep:'#B85D1E', corBright:'#FF9A4D', corDim:'rgba(232,121,42,.12)', corGlow:'rgba(232,121,42,.25)', temGraduacao:true,
    graduacoes:[{nome:'Branca',cor:'#F5EFEF'},{nome:'Amarela',cor:'#F4B942'},{nome:'Laranja',cor:'#E8792A'},{nome:'Verde',cor:'#2FA84F'},{nome:'Roxa',cor:'#7B3FA0'},{nome:'Marrom',cor:'#6B4226'},{nome:'Preta',cor:'#111111'}] },
  'muay-thai':{ nome:'Muay Thai', icone:'ti-bolt', cor:'#F4B942', corDeep:'#C7952B', corBright:'#FFD066', corDim:'rgba(244,185,66,.12)', corGlow:'rgba(244,185,66,.25)', temGraduacao:true,
    graduacoes:[{nome:'Prajioud Branco',cor:'#F5EFEF'},{nome:'Prajioud Amarelo',cor:'#F4B942'},{nome:'Prajioud Verde',cor:'#2FA84F'},{nome:'Prajioud Azul',cor:'#2E6FE0'},{nome:'Prajioud Vermelho',cor:'#D72638'},{nome:'Prajioud Preto',cor:'#111111'}] },
  'mma':{ nome:'MMA', icone:'ti-flame', cor:'#A81D29', corDeep:'#7A151F', corBright:'#D72638', corDim:'rgba(168,29,41,.12)', corGlow:'rgba(168,29,41,.25)', temGraduacao:false,
    graduacoes:[{nome:'Amador',cor:'#F5EFEF'},{nome:'Semi-Pro',cor:'#F4B942'},{nome:'Profissional',cor:'#D72638'}] },
  'boxe':{ nome:'Boxe', icone:'ti-hand-finger', cor:'#1FC8B4', corDeep:'#149584', corBright:'#4FE0CF', corDim:'rgba(31,200,180,.12)', corGlow:'rgba(31,200,180,.25)', temGraduacao:false,
    graduacoes:[{nome:'Novato',cor:'#F5EFEF'},{nome:'Amador',cor:'#F4B942'},{nome:'Competidor',cor:'#1FC8B4'},{nome:'Profissional',cor:'#D72638'}] },
  'kickboxing':{ nome:'Kickboxing', icone:'ti-shoe', cor:'#7B3FA0', corDeep:'#5C2E79', corBright:'#A566CC', corDim:'rgba(123,63,160,.12)', corGlow:'rgba(123,63,160,.25)', temGraduacao:true,
    graduacoes:[{nome:'Branca',cor:'#F5EFEF'},{nome:'Amarela',cor:'#F4B942'},{nome:'Laranja',cor:'#E8792A'},{nome:'Verde',cor:'#2FA84F'},{nome:'Azul',cor:'#2E6FE0'},{nome:'Marrom',cor:'#6B4226'},{nome:'Preta',cor:'#111111'}] },
  'taekwondo':{ nome:'Taekwondo', icone:'ti-shoe-off', cor:'#2FA84F', corDeep:'#217E3B', corBright:'#4FD077', corDim:'rgba(47,168,79,.12)', corGlow:'rgba(47,168,79,.25)', temGraduacao:true,
    graduacoes:[{nome:'Branca',cor:'#F5EFEF'},{nome:'Amarela',cor:'#F4B942'},{nome:'Verde',cor:'#2FA84F'},{nome:'Azul',cor:'#2E6FE0'},{nome:'Vermelha',cor:'#D72638'},{nome:'Preta',cor:'#111111'}] },
  'wrestling':{ nome:'Wrestling', icone:'ti-weight', cor:'#6B4226', corDeep:'#4E2F1B', corBright:'#93613A', corDim:'rgba(107,66,38,.14)', corGlow:'rgba(107,66,38,.3)', temGraduacao:false,
    graduacoes:[{nome:'Iniciante',cor:'#F5EFEF'},{nome:'Escolar',cor:'#F4B942'},{nome:'Universitário',cor:'#6B4226'},{nome:'Livre/Elite',cor:'#111111'}] },
  'capoeira':{ nome:'Capoeira', icone:'ti-music', cor:'#F4B942', corDeep:'#C7952B', corBright:'#FFD066', corDim:'rgba(244,185,66,.12)', corGlow:'rgba(244,185,66,.25)', temGraduacao:true,
    graduacoes:[{nome:'Corda Crua',cor:'#D8C7A1'},{nome:'Amarela',cor:'#F4B942'},{nome:'Laranja',cor:'#E8792A'},{nome:'Azul',cor:'#2E6FE0'},{nome:'Verde',cor:'#2FA84F'},{nome:'Roxa',cor:'#7B3FA0'},{nome:'Marrom',cor:'#6B4226'},{nome:'Vermelha',cor:'#D72638'}] }
};
/* Tabelas técnicas reutilizáveis — cada modalidade referencia uma delas.
   Isso evita duplicar 10 tabelas diferentes: agrupamos por família de esporte. */
const TABELAS_TECNICAS = {
  grappling_bjj:{ titulo:'Pontuação Oficial de Jiu-Jitsu', selo:'estilo IBJJF',
    linhas:[{label:'Queda',pts:2},{label:'Passagem de guarda',pts:3},{label:'Raspagem',pts:2},{label:'Montada',pts:4},{label:'Pegada de costas',pts:4}] },
  grappling_judo:{ titulo:'Pontuação Oficial de Judô', selo:'estilo Kodokan',
    linhas:[{label:'Queda (Ippon)',pts:4},{label:'Wazari',pts:2},{label:'Imobilização (Osaekomi)',pts:3},{label:'Transição pro solo',pts:2},{label:'Chave/Estrangulamento tentado',pts:2}] },
  grappling_wrestling:{ titulo:'Pontuação Oficial de Wrestling', selo:'livre/greco-romana',
    linhas:[{label:'Queda (Takedown)',pts:2},{label:'Reversão',pts:2},{label:'Vantagem (Near-fall)',pts:2},{label:'Domínio (Pin)',pts:4},{label:'Fuga (Escape)',pts:1}] },
  striking_kick:{ titulo:'Pontuação Técnica', selo:'golpes & controle',
    linhas:[{label:'Golpe de perna',pts:2},{label:'Golpe de tronco',pts:2},{label:'Golpe de cabeça',pts:3},{label:'Queda/Derrubada',pts:3},{label:'Clinch/Controle',pts:1}] },
  striking_punch:{ titulo:'Pontuação Técnica', selo:'golpes & controle',
    linhas:[{label:'Jab/Direto',pts:1},{label:'Cruzado/Gancho',pts:2},{label:'Contragolpe',pts:2},{label:'Combinação (3+ golpes)',pts:3},{label:'Clinch/Controle',pts:1}] },
};
/* Registro de esquema de treino por modalidade. Para adicionar um esporte novo
   no futuro: crie a modalidade em SPORTS_DB e aponte pra uma tabela existente
   aqui (ou crie uma nova em TABELAS_TECNICAS) — nada mais precisa mudar. */
const STATS_DB = {
  'jiu-jitsu':  { tabela:'grappling_bjj',       temTabela:true, temFinDef:true, labelSaldo:'Saldo BJJ',      findefTitulo:'Finalizações & Defesa',      labelFinAp:'Finalizações aplicadas',        labelFinSf:'Finalizações sofridas',        labelDef:'Defesas bem-sucedidas' },
  'judo':       { tabela:'grappling_judo',      temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Finalizações & Defesa',      labelFinAp:'Finalizações/Ippons aplicados', labelFinSf:'Finalizações/Ippons sofridos', labelDef:'Defesas bem-sucedidas' },
  'wrestling':  { tabela:'grappling_wrestling', temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Quedas Decisivas & Escapes', labelFinAp:'Quedas decisivas aplicadas',    labelFinSf:'Quedas decisivas sofridas',    labelDef:'Escapes bem-sucedidos' },
  'muay-thai':  { tabela:'striking_kick',       temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Finalização & Defesa',       labelFinAp:'Nocautes/quedas aplicados',     labelFinSf:'Nocautes/quedas sofridos',     labelDef:'Defesas/blocks bem-sucedidos' },
  'mma':        { tabela:'striking_kick',       temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Finalização & Defesa',       labelFinAp:'Finalizações/nocautes aplicados', labelFinSf:'Finalizações/nocautes sofridos', labelDef:'Defesas bem-sucedidas' },
  'karate':     { tabela:'striking_kick',       temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Pontuação & Defesa',         labelFinAp:'Golpes decisivos aplicados',    labelFinSf:'Golpes decisivos sofridos',    labelDef:'Defesas bem-sucedidas' },
  'kickboxing': { tabela:'striking_kick',       temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Nocaute & Defesa',           labelFinAp:'Nocautes/quedas aplicados',     labelFinSf:'Nocautes/quedas sofridos',     labelDef:'Defesas/blocks bem-sucedidos' },
  'taekwondo':  { tabela:'striking_kick',       temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Pontuação & Defesa',         labelFinAp:'Golpes decisivos aplicados',    labelFinSf:'Golpes decisivos sofridos',    labelDef:'Defesas bem-sucedidas' },
  'boxe':       { tabela:'striking_punch',      temTabela:true, temFinDef:true, labelSaldo:'Saldo técnico',  findefTitulo:'Nocaute & Defesa',           labelFinAp:'Nocautes/quedas aplicados',     labelFinSf:'Nocautes/quedas sofridos',     labelDef:'Defesas bem-sucedidas' },
  'capoeira':   { tabela:null,                  temTabela:false, temFinDef:false, labelSaldo:'Saldo técnico' },
};
/* Opções do seletor "posição geral" da correção do professor, por família de esporte. */
const POSICOES_CORRECAO = {
  grappling_bjj:['Guarda Fechada','Meia Guarda','Montada','Costas','50/50','Guarda Aberta','Queda','Passagem','Raspagem'],
  grappling_judo:['Queda','Osaekomi (imobilização)','Kesa-gatame','Combinação queda-solo','Pegada de gola','Base/postura'],
  grappling_wrestling:['Takedown','Sprawl','Par-terre','Pin/Domínio','Escape','Controle de quadril'],
  striking_kick:['Guarda','Distância','Clinch','Chute baixo','Chute alto','Combinação de mãos','Defesa/Bloqueio'],
  striking_punch:['Guarda','Jab','Combinação','Esquiva/Defesa','Trabalho de pés','Clinch'],
  basico:['Ginga','Esquiva','Au','Rasteira','Bênção','Meia-lua','Sequência/Ritmo'],
};
function populaPosicoesCorrecao(esporteId){
  const sel = document.getElementById('reg-nota-pos');
  if(!sel) return;
  const cfg = STATS_DB[esporteId] || STATS_DB['jiu-jitsu'];
  const familia = cfg.temTabela ? cfg.tabela : 'basico';
  const opts = POSICOES_CORRECAO[familia] || POSICOES_CORRECAO.grappling_bjj;
  sel.innerHTML = `<option value="">Posição geral</option>` + opts.map(o=>`<option>${escapeHtml(o)}</option>`).join('');
}
function aplicarEsquemaTreino(esporteId){
  populaPosicoesCorrecao(esporteId);
  const cfg = STATS_DB[esporteId] || STATS_DB['jiu-jitsu'];
  const cardTabela = document.getElementById('card-tabela-tecnica');
  const cardFindef = document.getElementById('card-findef');
  if(cardTabela) cardTabela.style.display = cfg.temTabela ? '' : 'none';
  if(cardFindef) cardFindef.style.display = cfg.temFinDef ? '' : 'none';
  if(cfg.temTabela){
    const tab = TABELAS_TECNICAS[cfg.tabela];
    const ttTitulo = document.getElementById('tt-titulo'); if(ttTitulo) ttTitulo.textContent = tab.titulo;
    const ttSelo = document.getElementById('tt-selo'); if(ttSelo) ttSelo.textContent = tab.selo;
    tab.linhas.forEach((linha,i)=>{
      const lbl = document.getElementById('tt-label-'+i); if(lbl) lbl.textContent = linha.label;
      const pts = document.getElementById('tt-pts-'+i); if(pts) pts.textContent = linha.pts;
      const tr = pts ? pts.closest('tr') : null; if(tr) tr.dataset.pts = linha.pts;
    });
  }
  if(cfg.temFinDef){
    const ft = document.getElementById('findef-titulo'); if(ft) ft.textContent = cfg.findefTitulo;
    const la = document.getElementById('findef-lbl-ap'); if(la) la.textContent = cfg.labelFinAp;
    const ls = document.getElementById('findef-lbl-sf'); if(ls) ls.textContent = cfg.labelFinSf;
    const ld = document.getElementById('findef-lbl-def'); if(ld) ld.textContent = cfg.labelDef;
  }
  const saldoLbl1 = document.getElementById('tt-saldo-lbl');
  if(saldoLbl1) saldoLbl1.textContent = `${cfg.labelSaldo} (feitos − sofridos)`;
  const saldoLbl2 = document.getElementById('sum-saldo-lbl');
  if(saldoLbl2) saldoLbl2.textContent = cfg.labelSaldo;
}
function pesosTabelaAtual(){
  const ud = getUserData();
  const cfg = STATS_DB[ud.profile.esporte] || STATS_DB['jiu-jitsu'];
  if(!cfg.temTabela) return [0,0,0,0,0];
  return TABELAS_TECNICAS[cfg.tabela].linhas.map(l=>l.pts);
}
function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function applySportTheme(sportId){
  const s = SPORTS_DB[sportId] || SPORTS_DB['jiu-jitsu'];
  const root = document.documentElement.style;
  root.setProperty('--red', s.cor);
  root.setProperty('--red-deep', s.corDeep);
  root.setProperty('--red-bright', s.corBright);
  root.setProperty('--red-dim', s.corDim);
  root.setProperty('--red-glow', s.corGlow);
  root.setProperty('--shadow-red', `0 8px 24px -8px ${hexToRgba(s.corBright, .35)}`);
  root.setProperty('--shadow-red-lg', `0 14px 38px -10px ${hexToRgba(s.corBright, .45)}`);
  root.setProperty('--focus-ring', `0 0 0 3px ${hexToRgba(s.corBright, .35)}`);
  root.setProperty('--sport-c', s.cor);
  root.setProperty('--sport-dim', s.corDim);
  root.setProperty('--sport-glow', s.corGlow);
}
function treinoEsporte(t){ return t.esporte || 'jiu-jitsu'; }
function treinosDaModalidade(ud){
  const esp = (ud.profile && ud.profile.esporte) || 'jiu-jitsu';
  return (ud.treinos||[]).filter(t=>treinoEsporte(t)===esp);
}
function compEsporte(c){ return c.esporte || 'jiu-jitsu'; }
function compsDaModalidade(ud){
  const esp = (ud.profile && ud.profile.esporte) || 'jiu-jitsu';
  return (ud.competicoes||[]).filter(c=>compEsporte(c)===esp);
}
function populaGraduacoesSelect(selectId, esporteId, valorAtual){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const s = SPORTS_DB[esporteId] || SPORTS_DB['jiu-jitsu'];
  sel.innerHTML = s.graduacoes.map(g=>`<option value="${escapeHtml(g.nome)}">${escapeHtml(g.nome)}</option>`).join('');
  sel.value = valorAtual && s.graduacoes.some(g=>g.nome===valorAtual) ? valorAtual : s.graduacoes[0].nome;
}
function renderSportSelect(){
  const grid = document.getElementById('sport-select-grid');
  if(!grid) return;
  const atual = getUserData().profile.esporte;
  grid.innerHTML = Object.keys(SPORTS_DB).map(id=>{
    const s = SPORTS_DB[id];
    return `<div class="sport-card${id===atual?' active':''}" style="--sport-c:${s.cor};--sport-dim:${s.corDim};--sport-glow:${s.corGlow}" onclick="selectSport('${id}')">
      <div class="sport-card-check"><i class="ti ti-check"></i></div>
      <div class="sport-card-icon"><i class="ti ${s.icone}"></i></div>
      <div class="sport-card-name">${escapeHtml(s.nome)}</div>
    </div>`;
  }).join('');
}
function selectSport(id){
  if(!SPORTS_DB[id]) return;
  const ud = getUserData();
  const mudouEsporte = ud.profile.esporte !== id;
  ud.profile.esporte = id;
  if(mudouEsporte || !ud.profile.faixa){
    ud.profile.faixa = SPORTS_DB[id].graduacoes[0].nome;
    ud.profile.grau = 0;
  }
  ud.profile.esporteEscolhido = true;
  saveUserData(ud);
  applySportTheme(id);
  aplicarEsquemaTreino(id);
  refreshAll();
  renderSportSelect();
  showScreen('dashboard');
  toast(`Modalidade definida: ${SPORTS_DB[id].nome}`);
}
let CU = null;
function getCU(){ return CU }
function getAllUsers(){ return STORE.get('users') || {} }
function saveUsers(u){ STORE.set('users',u) }
function getUserData(){
  const d = STORE.get('ud_'+CU) || defaultUserData();
  if(d.profile && !d.profile.esporte){
    d.profile.esporte = 'jiu-jitsu';
    d.profile.esporteEscolhido = true;
  }
  return d;
}
function saveUserData(d){ STORE.set('ud_'+CU, d); scheduleAutoSync(d); }
function defaultUserData(){
  return {
    profile:{ nome:'', academia:'', cidade:'', esporte:'jiu-jitsu', esporteEscolhido:false, faixa:'Azul', grau:0, anos:0, peso:0, altura:0 },
    fisico:{ peso:0, pesoMeta:0, gordura:0, fc:0, sono:0, hidra:0, historia:[] },
    treinos:[],
    competicoes:[],
    posicoes:[
      {nome:'Guard Fechada',pct:50,color:'var(--teal)'},
      {nome:'Meia Guarda',pct:50,color:'rgba(255,255,255,.5)'},
      {nome:'Montada',pct:50,color:'var(--gold)'},
      {nome:'Costas',pct:50,color:'var(--red)'},
      {nome:'50/50',pct:50,color:'var(--muted)'},
      {nome:'Guarda Aberta',pct:50,color:'var(--teal)'}
    ],
    metas:{
      semanal:[ {label:'Treinos por semana',meta:4,unidade:'treinos'}, {label:'Horas de treino',meta:6,unidade:'h'}, {label:'Sessões de sparring',meta:2,unidade:'sessões'} ],
      mensal:[ {label:'Treinos no mês',meta:16,unidade:'treinos'}, {label:'Finalizações',meta:30,unidade:'fin.'}, {label:'Preparação física',meta:4,unidade:'sessões'} ]
    },
  xp:0, streak:0, lastTrainDate:null, planoAcaoFeito:{}
    };
}

function switchAuthTab(t){
  document.getElementById('tab-login').classList.toggle('active', t==='login');
  document.getElementById('tab-register').classList.toggle('active', t==='register');
  document.getElementById('form-login').style.display = t==='login'?'flex':'none';
  document.getElementById('form-register').style.display = t==='register'?'flex':'none';
}
function showAuthError(id, msg){ const e=document.getElementById(id); e.textContent=msg; e.classList.add('show') }
function clearAuthErrors(){ document.querySelectorAll('.auth-error').forEach(e=>{e.classList.remove('show');e.textContent=''}) }
const PBKDF2_ITER=150000;
async function hashPassLegacySha256(pass, salt){
  const enc = new TextEncoder().encode(salt+':'+pass);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function hashPass(pass, salt, iterations=PBKDF2_ITER){
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:enc.encode(salt), iterations, hash:'SHA-256'}, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function genSalt(){ return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('') }
async function doLogin(){
  clearAuthErrors();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  if(!email||!pass){ showAuthError('login-error','Preencha todos os campos.'); return }

  if(CLOUD_MODE){
    await supaReady;
    if(!supaClient){ showAuthError('login-error','Não foi possível conectar ao servidor. Tente novamente.'); return }
    const { data, error } = await supaClient.auth.signInWithPassword({ email, password: pass });
    if(error){ showAuthError('login-error', error.message==='Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message); return }
    supaUser = { id: data.user.id, email: data.user.email };
    CU = data.user.email;
    try{
      const remote = await pullRemoteData();
      if(remote && remote.payload) saveUserData(remote.payload);
    }catch(e){ console.warn('Não foi possível puxar dados da nuvem, usando dados locais:', e); }
    launchApp();
    return;
  }

  const users = getAllUsers();
  const u = users[email];
  if(!u){ showAuthError('login-error','E-mail ou senha incorretos.'); return }
  let ok=false;
  if(u.salt && u.algo==='pbkdf2'){
    ok = (await hashPass(pass,u.salt,u.iter||PBKDF2_ITER))===u.pass;
  } else if(u.salt){
    ok = (await hashPassLegacySha256(pass,u.salt))===u.pass;
    if(ok){ u.iter=PBKDF2_ITER; u.algo='pbkdf2'; u.pass=await hashPass(pass,u.salt,u.iter); saveUsers(users); }
  } else {
    ok = u.pass===btoa(pass);
    if(ok){ const salt=genSalt(); const iter=PBKDF2_ITER; u.salt=salt; u.iter=iter; u.algo='pbkdf2'; u.pass=await hashPass(pass,salt,iter); saveUsers(users); }
  }
  if(!ok){ showAuthError('login-error','E-mail ou senha incorretos.'); return }
  CU = email;
  STORE.set('session', email);
  launchApp();
}
async function doRegister(){
  clearAuthErrors();
  const nome = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const academia = document.getElementById('reg-academia').value.trim();
  const faixa = document.getElementById('reg-faixa').value;
  const pass  = document.getElementById('reg-pass').value;
  if(!nome||!email||!pass){ showAuthError('reg-error','Preencha nome, e-mail e senha.'); return }
  if(pass.length<6){ showAuthError('reg-error','Senha muito curta (mínimo 6 caracteres).'); return }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showAuthError('reg-error','E-mail inválido.'); return }

  if(CLOUD_MODE){
    await supaReady;
    if(!supaClient){ showAuthError('reg-error','Não foi possível conectar ao servidor. Tente novamente.'); return }
    const { data, error } = await supaClient.auth.signUp({ email, password: pass, options: { data: { nome } } });
    if(error){ showAuthError('reg-error', error.message==='User already registered' ? 'Este e-mail já está cadastrado.' : error.message); return }
    if(!data.session){
      showAuthError('reg-error','Conta criada! Confira seu e-mail para confirmar antes de entrar.');
      return;
    }
    supaUser = { id: data.user.id, email: data.user.email };
    CU = data.user.email;
    const ud = defaultUserData();
    ud.profile.nome = nome;
    ud.profile.academia = academia;
    ud.profile.faixa = faixa;
    saveUserData(ud);
    await pushRemoteData(ud).catch(e=>console.warn('Falha ao enviar dados iniciais:', e));
    launchApp();
    return;
  }

  const users = getAllUsers();
  if(users[email]){ showAuthError('reg-error','Este e-mail já está cadastrado.'); return }
  const salt=genSalt();
  users[email] = { pass: await hashPass(pass,salt,PBKDF2_ITER), salt, iter:PBKDF2_ITER, algo:'pbkdf2', nome };
  saveUsers(users);
  CU = email;
  STORE.set('session', email);
  const ud = defaultUserData();
  ud.profile.nome = nome;
  ud.profile.academia = academia;
  ud.profile.faixa = faixa;
  saveUserData(ud);
  launchApp();
}

async function doLogout(){
  if(CLOUD_MODE && supaClient) await supaClient.auth.signOut().catch(()=>{});
  STORE.del('session');
  CU = null;
  supaUser = null;
  location.reload();
}
async function checkSession(){
  if(CLOUD_MODE){
    await supaReady;
    if(!supaClient) return;
    const { data } = await supaClient.auth.getSession();
    if(data && data.session){
      supaUser = { id: data.session.user.id, email: data.session.user.email };
      CU = data.session.user.email;
      try{
        const remote = await pullRemoteData();
        if(remote && remote.payload) saveUserData(remote.payload);
      }catch(e){ console.warn('Não foi possível puxar dados da nuvem, usando cache local:', e); }
      launchApp();
    }
    return;
  }
  const s = STORE.get('session');
  const users = getAllUsers();
  if(s && users[s]){ CU=s; launchApp(); }
}
let charts = {};
function launchApp(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  const ud = getUserData();
  applySportTheme(ud.profile.esporte);
  aplicarEsquemaTreino(ud.profile.esporte);
  renderSportSelect();
  refreshAll();
  if(!ud.profile.esporteEscolhido){ showScreen('esporte'); }
  else { showScreen('dashboard'); }
  initTheme();
  initNotifState();
  const syncCard = document.getElementById('sync-card');
  if(syncCard) syncCard.style.display = CLOUD_MODE ? '' : 'none';
  updateSyncStatusUI();
}
function refreshAll(){
  const ud = getUserData();
  updateTopbar(ud);
  renderDashboard(ud);
  renderRendimento(ud);
  renderEvolucao(ud);
  renderFisico(ud);
  renderComps(ud);
  renderIA(ud);
  renderSocial(ud);
  renderPerfil(ud);
  renderTreinosList(ud);
}

const SCREENS = ['dashboard','registro','rendimento','evolucao','fisico','competicoes','ia','social','perfil'];
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el = document.getElementById('screen-'+name);
  if(el) el.classList.add('active');
  const idx = SCREENS.indexOf(name);
  const navs = document.querySelectorAll('.nav-item');
  if(idx>=0 && idx<8) navs[idx].classList.add('active');
  else if(idx===8) navs[8].classList.add('active');
  if(name==='rendimento') renderRendimento(getUserData());
  if(name==='fisico') renderFisico(getUserData());
}

function initials(name){ return name.split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase()||'?' }
function formatH(mins){ const h=Math.floor(mins/60),m=mins%60; return h>0?(m>0?`${h}h ${m}m`:`${h}h`):`${m}m` }
function today(){ return new Date().toISOString().split('T')[0] }
function monthName(){ return new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
function weekLabel(){ const d=new Date(); return `Semana ${Math.ceil(d.getDate()/7)} · ${d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}` }
function calcXPLevel(xp){
  const thresholds=[0,500,1200,2200,3500,5000,7000,9500,12500,16000,20000];
  let lv=1;
  for(let i=0;i<thresholds.length-1;i++){ if(xp>=thresholds[i]) lv=i+1; }
  const names=['Iniciante','Novato','Treinador','Competidor','Experiente','Avançado','Especialista','Mestre','Elite','Lenda'];
  const curFloor = thresholds[lv-1]||0;
  const nextCeil = thresholds[lv]||thresholds[thresholds.length-1];
  const pct = Math.min(100, Math.round(((xp-curFloor)/(nextCeil-curFloor))*100));
  return { lv, name:names[lv-1]||'Lenda', next:nextCeil, cur:curFloor, pct, xpForNext:nextCeil-xp>0?nextCeil-xp:0 };
}
function calcStreak(treinos){
  if(!treinos||!treinos.length) return 0;
  const dates = [...new Set(treinos.map(t=>t.data))].sort().reverse();
  let streak=0, check=new Date(today());
  for(let d of dates){
    const dd=new Date(d);
    const diff=Math.round((check-dd)/(1000*60*60*24));
    if(diff===0||diff===1){ streak++; check=dd; }
    else break;
  }
  return streak;
}
const ACHIEVEMENTS=[
  {id:'first_train', icon:'ti-dumbbell', label:'1º treino', check:d=>d.treinos.length>=1},
  {id:'ten_trains', icon:'ti-star', label:'10 treinos', check:d=>d.treinos.length>=10},
  {id:'fifty_trains', icon:'ti-trophy', label:'50 treinos', check:d=>d.treinos.length>=50},
  {id:'streak7', icon:'ti-flame', label:'Streak 7d', check:d=>calcStreak(d.treinos)>=7},
  {id:'streak30', icon:'ti-rocket', label:'Streak 30d', check:d=>calcStreak(d.treinos)>=30},
  {id:'fin10', icon:'ti-sword', label:'10 finalizações', check:d=>d.treinos.reduce((a,t)=>a+(t.stats.finAp||0),0)>=10},
  {id:'fin50', icon:'ti-target', label:'50 finalizações', check:d=>d.treinos.reduce((a,t)=>a+(t.stats.finAp||0),0)>=50},
  {id:'hours100', icon:'ti-clock', label:'100h treino', check:d=>totalMinutes(d.treinos)>=6000},
  {id:'comp1', icon:'ti-medal', label:'1ª competição', check:d=>(d.competicoes||[]).length>=1},
  {id:'gold1', icon:'ti-award', label:'1 medalha ouro', check:d=>(d.competicoes||[]).some(c=>c.resultado==='ouro')},
  {id:'lv5', icon:'ti-crown', label:'Nível 5', check:d=>calcXPLevel(d.xp||0).lv>=5},
  {id:'allpos', icon:'ti-shield', label:'Defensor', check:d=>d.treinos.reduce((a,t)=>a+(t.stats.def||0),0)>=20},
];
function totalMinutes(treinos){
  return (treinos||[]).reduce((a,t)=>{
    if(!t.inicio||!t.fim) return a;
    const [h1,m1]=t.inicio.split(':').map(Number);
    const [h2,m2]=t.fim.split(':').map(Number);
    let diff=(h2*60+m2)-(h1*60+m1);
    if(diff<0) diff+=24*60;
    return a+diff;
  },0);
}
function toast(msg, type='success'){
  const t=document.getElementById('toast');
  const icon=document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent=msg;
  t.className='toast '+(type==='success'?'success':'error');
  icon.className='ti '+(type==='success'?'ti-check-circle':'ti-alert-circle');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
function closeModal(id){ document.getElementById(id).classList.add('hidden') }
function openModal(id){ document.getElementById(id).classList.remove('hidden') }

function updateTopbar(ud){
  const p=ud.profile;
  const ini=initials(p.nome||'?');
  document.getElementById('topbar-name').textContent=p.nome||'Atleta';
  document.getElementById('topbar-faixa').textContent=`Faixa ${p.faixa}${p.grau>0?' · '+p.grau+'º Grau':''}`;
  document.getElementById('topbar-av').textContent=ini;
  document.getElementById('dash-date').textContent=weekLabel();
  document.getElementById('hm-year').textContent=new Date().getFullYear();
}
let calendarioMes = new Date();
let diaSelecionado = null;
function calMudaMes(delta){
  calendarioMes.setMonth(calendarioMes.getMonth()+delta);
  renderCalendario(getUserData());
}
function renderCalendario(ud){
  const grid=document.getElementById('calendario-grid');
  if(!grid) return;
  const t=treinosDaModalidade(ud);
  const ano=calendarioMes.getFullYear(), mes=calendarioMes.getMonth();
  document.getElementById('cal-mes-label').textContent=calendarioMes.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const primeiroDia=new Date(ano,mes,1).getDay();
  const totalDias=new Date(ano,mes+1,0).getDate();
  const tiposCor={tecnica:'var(--gold)',sparring:'var(--red)',competicao:'var(--teal)',fisico:'rgba(255,255,255,.5)'};
  let html='';
  for(let i=0;i<primeiroDia;i++) html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=totalDias;d++){
    const ds=`${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const treinosDia=t.filter(x=>x.data===ds);
    const isToday=ds===today();
    const cls=['cal-day']; if(isToday) cls.push('today'); if(treinosDia.length) cls.push('has-treino');
    const dotCor = treinosDia.length ? (tiposCor[treinosDia[0].tipo]||'var(--gold)') : null;
    html+=`<div class="${cls.join(' ')}" onclick="abrirDiaCalendario('${ds}')">${d}${dotCor?`<div class="cal-dot" style="background:${dotCor}"></div>`:''}</div>`;
  }
  grid.innerHTML=html;
}
function abrirDiaCalendario(ds){
  diaSelecionado=ds;
  const ud=getUserData();
  const treinosDia=treinosDaModalidade(ud).filter(t=>t.data===ds);
  const dataFmt=new Date(ds+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  document.getElementById('dia-titulo').innerHTML=`${dataFmt} <button class="modal-close" onclick="closeModal('modal-dia')"><i class="ti ti-x"></i></button>`;
  const tiposLabel={tecnica:'Técnica',sparring:'Sparring',competicao:'Competição',fisico:'Prep. Física'};
  const lista=document.getElementById('dia-lista');
  if(!treinosDia.length){
    lista.innerHTML=`<div style="text-align:center;padding:14px;color:var(--muted);font-size:13px">Nenhum treino registrado nesse dia.</div>`;
  } else {
    lista.innerHTML=treinosDia.map(tr=>{
      const saldo=tr.stats?.saldoBJJ ?? calcSaldoBJJ(tr.stats||{});
      const saldoCor=saldo>0?'var(--teal)':saldo<0?'var(--red)':'var(--muted)';
      return `<div style="display:flex;align-items:center;gap:10px;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${tiposLabel[tr.tipo]||tr.tipo}</div>
          <div style="font-size:11px;color:var(--muted)">Intensidade ${tr.intensidade}/10 · Saldo <span style="color:${saldoCor};font-weight:600">${saldo>0?'+':''}${saldo}</span></div>
        </div>
        <button class="btn-sm" style="padding:6px 9px" onclick="closeModal('modal-dia');openEditTreino(${tr.id})"><i class="ti ti-edit" style="font-size:13px"></i></button>
      </div>`;
    }).join('');
  }
  openModal('modal-dia');
}
function irRegistrarNesseDia(){
  closeModal('modal-dia');
  showScreen('registro');
  if(diaSelecionado) document.getElementById('reg-data').value=diaSelecionado;
}

function renderDashboard(ud){
  const mes=new Date().getMonth(), ano=new Date().getFullYear();
  const treinosModalidade=treinosDaModalidade(ud);
  const treinosMes=treinosModalidade.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ano});
  const totalMins=totalMinutes(treinosMes);
  const streak=calcStreak(ud.treinos||[]);
  const xpData=calcXPLevel(ud.xp||0);
  document.getElementById('s-treinos-mes').textContent=treinosMes.length;
  document.getElementById('s-treinos-sub').textContent=treinosMes.length>0?`↑ ${treinosMes.length} treino(s) em ${new Date().toLocaleDateString('pt-BR',{month:'long'})}`:'Registre seu primeiro treino';
  document.getElementById('s-horas').innerHTML=`${Math.floor(totalMins/60)}<span>h ${totalMins%60>0?totalMins%60+'m':''}</span>`;
  document.getElementById('s-horas-sub').textContent=`No tatame em ${new Date().toLocaleDateString('pt-BR',{month:'long'})}`;
  document.getElementById('s-streak').innerHTML=`${streak}<span>dias</span>`;
  document.getElementById('s-streak-sub').textContent=streak>=7?'🔥 Incrível! Continue assim!':streak>0?`Continue treinando!`:'Registre um treino hoje!';
  document.getElementById('s-xp').innerHTML=`${ud.xp||0}<span>xp</span>`;
  document.getElementById('s-level').textContent=`Nível ${xpData.lv} · ${xpData.name}`;
  document.getElementById('dash-week-label').textContent=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const dotEl=document.getElementById('streak-dots');
  dotEl.innerHTML='';
  const days=['S','T','Q','Q','S','S','D'];
  const now=new Date();
  for(let i=0;i<7;i++){
    const d=new Date(now); d.setDate(now.getDate()-now.getDay()+i);
    const ds=d.toISOString().split('T')[0];
    const hasTrain=(ud.treinos||[]).some(t=>t.data===ds);
    const isToday=ds===today();
    const dot=document.createElement('div');
    dot.className='s-dot '+(isToday?'today':hasTrain?'done':'rest');
    dot.textContent=days[i]; dotEl.appendChild(dot);
  }
  document.getElementById('lv-name-dash').textContent=`Nível ${xpData.lv} — ${xpData.name}`;
  document.getElementById('lv-xp-dash').textContent=`${ud.xp||0} / ${xpData.next} xp`;
  document.getElementById('lv-fill-dash').style.width=xpData.pct+'%';
  renderAchGrid('ach-grid-dash', ud, 4);
  const rl=document.getElementById('recent-list');
  const recent=[...treinosModalidade].reverse().slice(0,4);
  if(!recent.length){
    rl.innerHTML=`<div style="text-align:center;padding:22px;color:var(--muted);font-size:13px"><i class="ti ti-dumbbell" style="font-size:26px;display:block;margin-bottom:7px;opacity:.4"></i>Nenhum treino ainda.<br><span style="color:var(--red);cursor:pointer;font-weight:600" onclick="showScreen('registro')">Registre seu primeiro!</span></div>`;
  } else {
    rl.innerHTML=recent.map(t=>{
      const iconMap={tecnica:'ri-tec ti-atom',sparring:'ri-sp ti-swords',fisico:'ri-fis ti-run',competicao:'ri-comp ti-medal'};
      const [cls,ic]=iconMap[t.tipo]?.split(' ')||['ri-tec','ti-dumbbell'];
      const mins=calcMins(t);
      const date=new Date(t.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
      return `<div class="rec-item">
        <div class="rec-icon ${cls}"><i class="ti ${ic}"></i></div>
        <div class="rec-info"><strong>${t.tipo.charAt(0).toUpperCase()+t.tipo.slice(1)}</strong><span>${date}${t.parceiro?' · com '+escapeHtml(t.parceiro):''}</span></div>
        <div class="rec-meta"><div class="rec-dur">${formatH(mins)}</div><div class="rec-int">Int. ${t.intensidade}/10</div></div>
      </div>`;
    }).join('');
  }
  renderHeatmap(treinosModalidade);
  renderPerfChart(ud);
  renderCalendario(ud);
}
function calcMins(t){
  if(!t.inicio||!t.fim) return 0;
  const [h1,m1]=t.inicio.split(':').map(Number);
  const [h2,m2]=t.fim.split(':').map(Number);
  let d=(h2*60+m2)-(h1*60+m1);
  if(d<0) d+=1440;
  return d;
}
function renderHeatmap(treinos){
  const hm=document.getElementById('heatmap');
  hm.innerHTML='';
  const countMap={};
  treinos.forEach(t=>{ countMap[t.data]=(countMap[t.data]||0)+1 });
  const start=new Date(); start.setDate(start.getDate()-90);
  for(let i=0;i<104;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const ds=d.toISOString().split('T')[0];
    const cnt=countMap[ds]||0;
    const cls=cnt===0?'hm-0':cnt===1?'hm-1':cnt===2?'hm-2':cnt===3?'hm-3':'hm-4';
    const cell=document.createElement('div');
    cell.className='hm-cell '+cls;
    cell.title=ds+': '+cnt+' treino(s)';
    hm.appendChild(cell);
  }
}
function renderPerfChart(ud){
  const now=new Date();
  const labels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const data=Array(7).fill(0);
  const colors=[];
  for(let i=0;i<7;i++){
    const d=new Date(now); d.setDate(now.getDate()-now.getDay()+i);
    const ds=d.toISOString().split('T')[0];
    const trains=treinosDaModalidade(ud).filter(t=>t.data===ds);
    data[i]=trains.reduce((a,t)=>a+calcMins(t),0);
    colors.push(data[i]===0?'rgba(215,38,56,.06)':data[i]>=100?'var(--gold)':'var(--red)');
  }
  if(charts.perf) charts.perf.destroy();
  charts.perf=new Chart(document.getElementById('perfChart'),{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:7,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
      x:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}},
      y:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}}
    }}
  });
}
let selectedType='tecnica';

function selectType(el,t){
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); selectedType=t;
}
function updateIntColor(v){
  const el=document.getElementById('intVal');
  el.textContent=v;
  const pct=((v-1)/9)*100;
  document.getElementById('intRange').style.background=`linear-gradient(90deg,var(--red) ${pct}%,var(--card2) ${pct}%)`;
  const cor=v<=3?'rgba(255,255,255,.7)':v<=6?'var(--gold)':'var(--red)';
  el.style.color=cor;
  const badge=document.getElementById('int-badge');
  if(badge){
    badge.textContent=v<=3?'Leve':v<=6?'Moderado':'Extremo';
    badge.style.color=cor;
    badge.style.background=v<=3?'rgba(255,255,255,.08)':v<=6?'var(--gold-dim)':'var(--red-dim)';
  }
}

function diffMinutos(inicio,fim){
  if(!inicio||!fim) return 0;
  const [h1,m1]=inicio.split(':').map(Number);
  const [h2,m2]=fim.split(':').map(Number);
  let diff=(h2*60+m2)-(h1*60+m1);
  if(diff<0) diff+=24*60;
  return diff;
}
function formatMin(min){
  if(!min) return '—';
  const h=Math.floor(min/60), m=min%60;
  return h>0 ? `${h}h${m>0?' '+m+'min':''}` : `${m}min`;
}
function updateDuracaoPreview(){
  const inicio=document.getElementById('reg-inicio').value;
  const fim=document.getElementById('reg-fim').value;
  const min=diffMinutos(inicio,fim);
  const chip=document.getElementById('reg-duracao-txt');
  if(chip) chip.textContent = min>0 ? `${formatMin(min)} de treino` : 'Defina o horário do treino';
  const sum=document.getElementById('sum-duracao');
  if(sum) sum.textContent = min>0 ? formatMin(min) : '—';
}
function calcXPGain(finAp,saldoBJJ){
  return 50 + (finAp*15) + Math.max(0,saldoBJJ)*2;
}
function stepScore(id,delta){
  const el=document.getElementById(id);
  if(!el) return;
  let v=(parseInt(el.value)||0)+delta;
  v=Math.max(0,Math.min(99,v));
  el.value=v;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  const wrap=el.closest('.stepper');
  if(wrap){ wrap.classList.remove('bump'); void wrap.offsetWidth; wrap.classList.add('bump'); }
}
function gv(id){ return parseInt(document.getElementById(id).value)||0 }
function calcSaldoBJJ(s){
  const [p1,p2,p3,p4,p5] = pesosTabelaAtual();
  return p1*((s.quedas||0)-(s.quedasSf||0))
       + p2*((s.guard||0)-(s.guardSf||0))
       + p3*((s.rasp||0)-(s.raspSf||0))
       + p4*((s.montada||0)-(s.montadaSf||0))
       + p5*((s.costas||0)-(s.costasSf||0));
}
function updateSaldoPreview(){
  const s={
    quedas:gv('r-quedas'), quedasSf:gv('r-quedas-sf'),
    guard:gv('r-guard'), guardSf:gv('r-guard-sf'),
    rasp:gv('r-rasp'), raspSf:gv('r-rasp-sf'),
    montada:gv('r-montada'), montadaSf:gv('r-montada-sf'),
    costas:gv('r-costas'), costasSf:gv('r-costas-sf'),
  };
  const saldo=calcSaldoBJJ(s);
  const el=document.getElementById('r-saldo-preview');
  el.textContent=(saldo>0?'+':'')+saldo;
  const cor=saldo>0?'var(--teal)':saldo<0?'var(--red)':'var(--muted)';
  el.style.color=cor;

  const finAp=gv('r-fin-ap');
  const xp=calcXPGain(finAp,saldo);
  const sumSaldo=document.getElementById('sum-saldo');
  if(sumSaldo){ sumSaldo.textContent=(saldo>0?'+':'')+saldo; sumSaldo.style.color=cor; }
  const sumXp=document.getElementById('sum-xp');
  if(sumXp) sumXp.textContent='+'+xp+' XP';
  const btnTxt=document.getElementById('btn-salvar-txt');
  if(btnTxt) btnTxt.textContent=`Salvar Treino (+${xp} XP)`;
  updateDuracaoPreview();
}
let regSubsAp=[], regSubsSf=[];
function addSubTag(which){
  const inp=document.getElementById(which==='ap'?'sub-tag-ap-input':'sub-tag-sf-input');
  const val=inp.value.trim();
  if(!val) return;
  (which==='ap'?regSubsAp:regSubsSf).push(val);
  inp.value='';
  renderSubTags();
}
function removeSubTag(which, idx){
  (which==='ap'?regSubsAp:regSubsSf).splice(idx,1);
  renderSubTags();
}
function renderSubTags(){
  const apEl=document.getElementById('sub-tags-ap'), sfEl=document.getElementById('sub-tags-sf');
  if(apEl) apEl.innerHTML=regSubsAp.map((s,i)=>`<span class="sub-tag ap">${escapeHtml(s)}<button type="button" onclick="removeSubTag('ap',${i})" aria-label="Remover"><i class="ti ti-x"></i></button></span>`).join('');
  if(sfEl) sfEl.innerHTML=regSubsSf.map((s,i)=>`<span class="sub-tag sf">${escapeHtml(s)}<button type="button" onclick="removeSubTag('sf',${i})" aria-label="Remover"><i class="ti ti-x"></i></button></span>`).join('');
}
function saveTraining(){
  const data=document.getElementById('reg-data').value||today();
  const inicio=document.getElementById('reg-inicio').value;
  const fim=document.getElementById('reg-fim').value;
  const duracaoMin=diffMinutos(inicio,fim);
  if(inicio && fim && duracaoMin===0){
    toast('Horário de início e fim parecem iguais — confira antes de salvar.','error');
    return;
  }
  const intensidade=parseInt(document.getElementById('intRange').value)||5;
  const parceiro=document.getElementById('reg-parceiro').value.trim();
  const obs=document.getElementById('reg-obs').value.trim();
  const notaProf=document.getElementById('reg-nota-prof').value.trim();
  const notaProfPos=document.getElementById('reg-nota-pos').value;
  const subsAp=[...regSubsAp], subsSf=[...regSubsSf];
  const stats={
    finAp:gv('r-fin-ap'), finSf:gv('r-fin-sf'), def:gv('r-def'),
    quedas:gv('r-quedas'), quedasSf:gv('r-quedas-sf'),
    guard:gv('r-guard'), guardSf:gv('r-guard-sf'),
    rasp:gv('r-rasp'), raspSf:gv('r-rasp-sf'),
    montada:gv('r-montada'), montadaSf:gv('r-montada-sf'),
    costas:gv('r-costas'), costasSf:gv('r-costas-sf'),
  };
  stats.saldoBJJ=calcSaldoBJJ(stats);
  const xpGain=calcXPGain(stats.finAp,stats.saldoBJJ);
  const ud=getUserData();
  const treino={id:Date.now(),esporte:ud.profile.esporte||'jiu-jitsu',data,inicio,fim,duracaoMin,tipo:selectedType,intensidade,parceiro,obs,notaProf,notaProfPos,subsAp,subsSf,stats};
  ud.treinos.push(treino);
  ud.xp=(ud.xp||0)+xpGain;
  ud.lastTrainDate=data;
  saveUserData(ud);
  ['r-fin-ap','r-fin-sf','r-guard','r-guard-sf','r-rasp','r-rasp-sf','r-quedas','r-quedas-sf','r-montada','r-montada-sf','r-costas','r-costas-sf','r-def'].forEach(id=>document.getElementById(id).value=0);
  document.getElementById('reg-parceiro').value='';
  document.getElementById('reg-obs').value='';
  document.getElementById('reg-nota-prof').value='';
  document.getElementById('reg-nota-pos').value='';
  regSubsAp=[]; regSubsSf=[]; renderSubTags();
  updateSaldoPreview();
  refreshAll();
  const btn=document.getElementById('btn-salvar-treino');
  if(btn){ btn.classList.remove('saved-pulse'); void btn.offsetWidth; btn.classList.add('saved-pulse'); }
  toast(`Treino salvo! +${xpGain} XP 🥋`);
  setTimeout(()=>{ if(btn) btn.classList.remove('saved-pulse'); showScreen('dashboard'); }, 550);
}
let mapaPeriodoDias = 30;
function setPeriodo(dias){
  mapaPeriodoDias = dias;
  document.querySelectorAll('#periodo-filtro .pf-btn').forEach(b=>b.classList.toggle('active', parseInt(b.dataset.dias,10)===dias));
  renderRendimento(getUserData());
}
function filterByPeriodo(treinos){
  if(!mapaPeriodoDias) return treinos;
  const limite=new Date(); limite.setDate(limite.getDate()-mapaPeriodoDias);
  return (treinos||[]).filter(t=>new Date(t.data)>=limite);
}
const POSICOES_DEFS=[
  {nome:'Queda',ap:'quedas',sf:'quedasSf',pts:2,path:'M12 3v12m0 0l-5-5m5 5l5-5M5 19h14'},
  {nome:'Passagem',ap:'guard',sf:'guardSf',pts:3,path:'M4 12h16m0 0l-5-5m5 5l-5 5'},
  {nome:'Raspagem',ap:'rasp',sf:'raspSf',pts:2,path:'M4 12a8 8 0 1 1 8 8M4 12l4-4M4 12l4 4'},
  {nome:'Montada',ap:'montada',sf:'montadaSf',pts:4,path:'M5 21V9a7 7 0 0 1 14 0v12M5 21h14'},
  {nome:'Costas',ap:'costas',sf:'costasSf',pts:4,path:'M6 4h8a4 4 0 0 1 4 4v12H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'},
];

function corPorRatio(ratio){
  if(ratio===null) return {base:'rgba(255,255,255,.3)',id:'neutro'};
  if(ratio>=0.65) return {base:'var(--teal)',id:'teal'};
  if(ratio>=0.45) return {base:'var(--gold)',id:'gold'};
  return {base:'var(--red)',id:'red'};
}
function renderMapaPosicoes(ud, treinosFiltrados){
  const t=treinosFiltrados || filterByPeriodo(treinosDaModalidade(ud));
  const agg=(ap,sf)=>t.reduce((acc,x)=>{acc.a+=(x.stats?.[ap]||0);acc.s+=(x.stats?.[sf]||0);return acc},{a:0,s:0});
  const defs=POSICOES_DEFS;
  const posicoes=defs.map(p=>{
    const {a,s}=agg(p.ap,p.sf);
    const total=a+s;
    const ratio=total>0?a/total:null;
    return {...p,a,s,total,ratio,cor:corPorRatio(ratio)};
  });
  const totalSaldo=t.reduce((acc,x)=>acc+(x.stats?.saldoBJJ ?? calcSaldoBJJ(x.stats||{})),0);
  const saldoCor = totalSaldo>0?'var(--teal)':totalSaldo<0?'var(--red)':'rgba(255,255,255,.4)';
  const saldoId = totalSaldo>0?'teal':totalSaldo<0?'red':'neutro';

  const S=620, CX=S/2, CY=S/2-6, R=205, NODE_R=64;
  const N=posicoes.length;
  const angleFor=i=>-90+ (360/N)*i;
  const toXY=(ang,radius)=>{
    const rad=ang*Math.PI/180;
    return [CX+radius*Math.cos(rad), CY+radius*Math.sin(rad)];
  };

  
  let grid='';
  [0.42,0.68,0.94].forEach(f=>{
    grid+=`<circle cx="${CX}" cy="${CY}" r="${R*f+NODE_R*0.0}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/>`;
  });
  for(let i=0;i<N;i++){
    const [x,y]=toXY(angleFor(i),R);
    grid+=`<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
  }

  let gradDefs='';
  let nodes='';
  posicoes.forEach((p,i)=>{
    const ang=angleFor(i);
    const [x,y]=toXY(ang,R);
    const gid='mpGrad'+i;
    gradDefs+=`
      <radialGradient id="${gid}" cx="35%" cy="30%" r="75%">
        <stop offset="0%" style="stop-color:${p.cor.base};stop-opacity:.55"/>
        <stop offset="100%" style="stop-color:${p.cor.base};stop-opacity:.06"/>
      </radialGradient>`;
    const pctTxt = p.ratio===null ? '—' : Math.round(p.ratio*100)+'%';
    const labelY = y > CY ? y+NODE_R+22 : y-NODE_R-30;
    nodes+=`
      <g class="mp-node" onclick="abrirDetalhePosicao('${p.ap}','${p.sf}','${p.nome}',${p.pts})" style="filter:drop-shadow(0 0 ${p.total>0?'10px':'0px'} ${p.cor.base})">
        <circle cx="${x}" cy="${y}" r="${NODE_R}" fill="url(#${gid})" stroke="${p.cor.base}" stroke-width="1.6" stroke-opacity="${p.total>0?0.85:0.35}"/>
        <circle cx="${x}" cy="${y}" r="${NODE_R+8}" fill="transparent"/>
        <circle cx="${x}" cy="${y}" r="${NODE_R-7}" fill="none" stroke="${p.cor.base}" stroke-width="1" stroke-opacity=".18"/>
        <g transform="translate(${x-11},${y-29}) scale(0.92)"><path d="${p.path}" fill="none" stroke="${p.total>0?p.cor.base:'rgba(255,255,255,.35)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>
        <text x="${x}" y="${y+13}" text-anchor="middle" fill="${p.total>0?'var(--text)':'rgba(255,255,255,.4)'}" font-size="21" font-weight="800" font-family="var(--font-d)">${pctTxt}</text>
        <text x="${x}" y="${y+28}" text-anchor="middle" fill="var(--muted)" font-size="9.5">${p.pts} pts</text>
        <text x="${x}" y="${labelY}" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="700" font-family="var(--font-d)">${p.nome}</text>
        <text x="${x}" y="${labelY+14}" text-anchor="middle" fill="var(--muted)" font-size="9.5">${p.total>0?`${p.a} feitos · ${p.s} sofridos`:'sem dados'}</text>
      </g>`;
  });

  const hubR=72;
  gradDefs+=`
    <radialGradient id="mpHub" cx="38%" cy="30%" r="75%">
      <stop offset="0%" style="stop-color:${saldoCor};stop-opacity:.5"/>
      <stop offset="100%" style="stop-color:${saldoCor};stop-opacity:.08"/>
    </radialGradient>`;
  const hub=`
    <g style="filter:drop-shadow(0 0 16px ${saldoCor})">
      <circle cx="${CX}" cy="${CY}" r="${hubR}" fill="url(#mpHub)" stroke="${saldoCor}" stroke-width="1.8"/>
      <circle cx="${CX}" cy="${CY}" r="${hubR-9}" fill="none" stroke="${saldoCor}" stroke-width="1" stroke-opacity=".25"/>
      <text x="${CX}" y="${CY-6}" text-anchor="middle" fill="var(--muted)" font-size="9.5" letter-spacing="1px">SALDO TOTAL</text>
      <text x="${CX}" y="${CY+22}" text-anchor="middle" fill="${saldoCor}" font-size="28" font-weight="800" font-family="var(--font-d)">${totalSaldo>0?'+':''}${totalSaldo}</text>
    </g>`;

  const svg=`<svg viewBox="0 0 ${S} ${S-10}" style="width:100%;max-width:560px;height:auto;display:block;margin:0 auto">
    <defs>${gradDefs}</defs>
    ${grid}
    ${hub}
    ${nodes}
  </svg>`;
  document.getElementById('mapa-posicoes').innerHTML = svg;

  const compEl=document.getElementById('mapa-comparacao');
  if(compEl){
    if(!mapaPeriodoDias){
      compEl.innerHTML='';
    } else {
      const now=new Date();
      const limiteAtual=new Date(); limiteAtual.setDate(now.getDate()-mapaPeriodoDias);
      const limiteAnterior=new Date(); limiteAnterior.setDate(now.getDate()-mapaPeriodoDias*2);
      const anterior=treinosDaModalidade(ud).filter(x=>{const d=new Date(x.data); return d>=limiteAnterior && d<limiteAtual});
      const saldoAnterior=anterior.reduce((a,x)=>a+(x.stats?.saldoBJJ??calcSaldoBJJ(x.stats||{})),0);
      const delta=totalSaldo-saldoAnterior;
      const subiu=delta>0;
      compEl.innerHTML = (anterior.length||t.length) ? `
        <div style="font-size:12px;color:var(--muted);background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:9px 12px">
          <i class="ti ${subiu?'ti-trending-up':delta<0?'ti-trending-down':'ti-minus'}" style="color:${subiu?'var(--teal)':delta<0?'var(--red)':'var(--muted)'};margin-right:6px"></i>
          Comparado aos ${mapaPeriodoDias} dias anteriores (saldo ${saldoAnterior>0?'+':''}${saldoAnterior}): seu saldo ${subiu?'subiu':delta<0?'caiu':'ficou igual'} <strong style="color:${subiu?'var(--teal)':delta<0?'var(--red)':'var(--muted)'}">${delta>0?'+':''}${delta}</strong> pontos.
        </div>` : '';
    }
  }

  const sugEl=document.getElementById('mapa-sugestao');
  if(sugEl){
    const candidatas=posicoes.filter(p=>p.total>=3).sort((a,b)=>a.ratio-b.ratio);
    if(candidatas.length){
      const pior=candidatas[0];
      sugEl.innerHTML = `
        <div style="font-size:12px;color:var(--text);background:rgba(215,38,56,.08);border:1px solid rgba(215,38,56,.25);border-radius:9px;padding:9px 12px">
          <i class="ti ti-bulb" style="color:var(--gold);margin-right:6px"></i>
          <strong>Sugestão de foco:</strong> sua posição mais frágil agora é <strong>${pior.nome}</strong> (${Math.round(pior.ratio*100)}% de aproveitamento). Vale priorizar isso no próximo treino.
        </div>`;
    } else {
      sugEl.innerHTML='';
    }
  }
}

function abrirDetalhePosicao(ap, sf, nome, pts){
  const ud=getUserData();
  const treinos=[...filterByPeriodo(treinosDaModalidade(ud))].sort((a,b)=>new Date(a.data)-new Date(b.data));
  let acc=0, totalA=0, totalS=0;
  const labels=[]; const serie=[];
  treinos.forEach(tr=>{
    const a=tr.stats?.[ap]||0, s=tr.stats?.[sf]||0;
    if(a===0 && s===0) return;
    totalA+=a; totalS+=s;
    acc += pts*(a-s);
    labels.push(new Date(tr.data+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}));
    serie.push(acc);
  });
  const total=totalA+totalS;
  const pct = total>0 ? Math.round(totalA/total*100) : 0;
  document.getElementById('pd-titulo').innerHTML = `${nome} <button class="modal-close" onclick="closeModal('modal-pos-detalhe')"><i class="ti ti-x"></i></button>`;
  document.getElementById('pd-resumo').innerHTML = `
    <div><div style="font-size:18px;font-weight:800;color:var(--teal)">${totalA}</div><div>feitas</div></div>
    <div><div style="font-size:18px;font-weight:800;color:var(--red)">${totalS}</div><div>sofridas</div></div>
    <div><div style="font-size:18px;font-weight:800;color:${pct>=50?'var(--teal)':'var(--red)'}">${pct}%</div><div>aproveitamento</div></div>
    <div><div style="font-size:18px;font-weight:800;color:${acc>0?'var(--teal)':acc<0?'var(--red)':'var(--muted)'}">${acc>0?'+':''}${acc}</div><div>saldo no período</div></div>`;
  if(charts.posDetalhe) charts.posDetalhe.destroy();
  if(!labels.length){
    document.getElementById('pd-chart-wrap').innerHTML = `<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px"><div><i class="ti ti-chart-line" style="font-size:26px;display:block;text-align:center;margin-bottom:8px;opacity:.4"></i>Sem dados dessa posição no período selecionado.</div></div>`;
  } else {
    document.getElementById('pd-chart-wrap').innerHTML = `<canvas id="pdChart"></canvas>`;
    charts.posDetalhe=new Chart(document.getElementById('pdChart'),{
      type:'line',
      data:{labels,datasets:[{
        label:'Saldo acumulado',data:serie,
        borderColor:acc>=0?'var(--teal)':'var(--red)',
        backgroundColor:acc>=0?'rgba(31,200,180,.1)':'rgba(215,38,56,.1)',
        fill:true,tension:.35,pointRadius:3,pointBackgroundColor:acc>=0?'var(--teal)':'var(--red)'
      }]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
        x:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:10}}},
        y:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:10}}}
      }}
    });
  }
  openModal('modal-pos-detalhe');
}

function renderRendimento(ud){
  const tAll=treinosDaModalidade(ud);
  const t=filterByPeriodo(tAll);
  const totFin=t.reduce((a,x)=>a+(x.stats.finAp||0),0);
  const totSf=t.reduce((a,x)=>a+(x.stats.finSf||0),0);
  const totG=t.reduce((a,x)=>a+(x.stats.guard||0),0);
  const totR=t.reduce((a,x)=>a+(x.stats.rasp||0),0);
  document.getElementById('r-total-fin').textContent=totFin;
  document.getElementById('r-total-sf').textContent=totSf;
  document.getElementById('r-total-guard').textContent=totG;
  document.getElementById('r-total-rasp').textContent=totR;
  renderMapaPosicoes(ud, t);
  const rate=totFin+totSf>0?Math.round(totFin/(totFin+totSf)*100):0;
  document.getElementById('r-taxa').textContent=rate>0?`Taxa: ${rate}% de sucesso`:'—';
  const pg=document.getElementById('pos-grid');
  pg.innerHTML=(ud.posicoes||[]).map(p=>`
    <div class="pos-card">
      <div class="pos-name">${p.nome}</div>
      <div class="pos-bar"><div class="pos-fill" style="width:${p.pct}%;background:${p.color}"></div></div>
      <div class="pos-stat" style="color:${p.color}">${p.pct}%</div>
    </div>`).join('');
  const subCounts={};
  t.forEach(x=>(x.subsAp||[]).forEach(s=>{ subCounts[s]=(subCounts[s]||0)+1 }));
  const subEntries=Object.entries(subCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(charts.sub) charts.sub.destroy();
  const subChartWrap=document.getElementById('subChart').parentElement;
  if(!subEntries.length){
    subChartWrap.innerHTML='<canvas id="subChart"></canvas><div id="subChart-empty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted);text-align:center;padding:0 14px">Registre as finalizações específicas no formulário de treino para ver seu ranking de golpes favoritos aqui.</div>';
    subChartWrap.style.position='relative';
  } else {
    subChartWrap.innerHTML='<canvas id="subChart"></canvas>';
    const reds=['var(--red)','rgba(215,38,56,.75)','rgba(215,38,56,.6)','rgba(215,38,56,.45)','rgba(215,38,56,.3)','rgba(215,38,56,.18)'];
    charts.sub=new Chart(document.getElementById('subChart'),{
      type:'bar',
      data:{
        labels:subEntries.map(e=>e[0]),
        datasets:[{ data:subEntries.map(e=>e[1]), backgroundColor:reds, borderRadius:6, borderSkipped:false }]
      },
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
        x:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11},precision:0}},
        y:{grid:{display:false},ticks:{color:'rgba(245,239,239,.6)',font:{size:11}}}
      }}
    });
  }
  const months=[];const finByMonth=[];const defByMonth=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    months.push(d.toLocaleDateString('pt-BR',{month:'short'}));
    const mt=tAll.filter(x=>{const xd=new Date(x.data);return xd.getMonth()===d.getMonth()&&xd.getFullYear()===d.getFullYear()});
    finByMonth.push(mt.reduce((a,x)=>a+(x.stats.finAp||0),0));
    defByMonth.push(mt.reduce((a,x)=>a+(x.stats.def||0),0));
  }
  if(charts.evol) charts.evol.destroy();
  charts.evol=new Chart(document.getElementById('evolChart'),{
    type:'line',
    data:{labels:months,datasets:[
      {label:'Finalizações',data:finByMonth,borderColor:'var(--red)',backgroundColor:'rgba(215,38,56,.08)',fill:true,tension:.4,pointBackgroundColor:'var(--red)',pointRadius:4,pointHoverRadius:6},
      {label:'Defesas',data:defByMonth,borderColor:'var(--teal)',backgroundColor:'rgba(31,200,180,.07)',fill:true,tension:.4,pointBackgroundColor:'var(--teal)',pointRadius:4,pointHoverRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'rgba(245,239,239,.6)',font:{size:11}}}},scales:{
      x:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}},
      y:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}}
    }}
  });
}
function renderAchGrid(elId, ud, limit){
  const el=document.getElementById(elId);
  if(!el) return;
  const list=limit?ACHIEVEMENTS.slice(0,limit):ACHIEVEMENTS;
  el.innerHTML=list.map(a=>{
    const unlocked=a.check(ud);
    return `<div class="ach ${unlocked?'unlocked':''}" title="${a.label}">
      <i class="ti ${a.icon}"></i><span>${a.label}</span>
    </div>`;
  }).join('');
}
function renderEvolucao(ud){
  const xpData=calcXPLevel(ud.xp||0);
  document.getElementById('lv-circle').textContent=xpData.lv;
  document.getElementById('lv-titulo').textContent=xpData.name;
  document.getElementById('lv-faixa-ev').textContent=`Faixa ${ud.profile.faixa}${ud.profile.grau>0?' · '+ud.profile.grau+'º Grau':''}`;
  document.getElementById('lv-xp-next').textContent=`${ud.xp||0} / ${xpData.next} XP para nível ${xpData.lv+1}`;
  document.getElementById('lv-fill-ev').style.width=xpData.pct+'%';
  renderAchGrid('ach-grid-ev', ud);
  const achCount=ACHIEVEMENTS.filter(a=>a.check(ud)).length;
  document.getElementById('ach-count-badge').textContent=`${achCount}/${ACHIEVEMENTS.length}`;
  renderMetasView('semanal', ud);
  renderMetasView('mensal', ud);
  renderSugestaoMeta(ud);
  renderNotasProf(ud, document.getElementById('notas-search')?.value||'');
}

function renderSugestaoMeta(ud){
  const wrap=document.getElementById('meta-sugestao-wrap');
  if(!wrap) return;
  const t=filterByPeriodo(treinosDaModalidade(ud));
  const agg=(ap,sf)=>t.reduce((acc,x)=>{acc.a+=(x.stats?.[ap]||0);acc.s+=(x.stats?.[sf]||0);return acc},{a:0,s:0});
  const candidatas=POSICOES_DEFS.map(p=>{
    const {a,s}=agg(p.ap,p.sf); const total=a+s;
    return {...p, ratio: total>0?a/total:null, total};
  }).filter(p=>p.total>=3).sort((a,b)=>a.ratio-b.ratio);
  if(!candidatas.length){ wrap.innerHTML=''; return; }
  const pior=candidatas[0];
  wrap.innerHTML=`
    <div class="card" style="border-color:rgba(244,185,66,.3)">
      <div class="card-title"><span><i class="ti ti-bulb" style="color:var(--gold);margin-right:8px"></i>Sugestão de foco</span><span class="card-badge badge-gold">automática</span></div>
      <p style="font-size:12.5px;color:var(--text);margin:0 0 10px;line-height:1.6">Sua posição mais frágil no período é <strong>${pior.nome}</strong>, com <strong>${Math.round(pior.ratio*100)}%</strong> de aproveitamento. Priorize drilling e sparring focado nela nos próximos treinos antes de criar uma meta nova.</p>
      <button class="btn-sm" onclick="showScreen('registro')"><i class="ti ti-plus-circle" style="font-size:12px"></i> Registrar treino focado nisso</button>
    </div>`;
}
function renderNotasProf(ud, filtro){
  const list=document.getElementById('notas-prof-list');
  const badge=document.getElementById('notas-count-badge');
  if(!list) return;
  const termo=(filtro||'').trim().toLowerCase();
  let notas=[...treinosDaModalidade(ud)].filter(t=>t.notaProf).sort((a,b)=>new Date(b.data)-new Date(a.data));
  if(termo) notas=notas.filter(t=>(t.notaProf||'').toLowerCase().includes(termo) || (t.notaProfPos||'').toLowerCase().includes(termo));
  if(badge) badge.textContent=notas.length;
  if(!notas.length){
    list.innerHTML=`<div style="text-align:center;padding:18px;color:var(--muted);font-size:12.5px">${termo?'Nenhuma nota encontrada com esse filtro.':'Nenhuma correção registrada ainda. Adicione no formulário de Registrar Treino.'}</div>`;
    return;
  }
  list.innerHTML=notas.map(t=>`
    <div style="padding:10px 12px;background:var(--card2);border:1px solid var(--border);border-radius:9px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:11px;color:var(--muted)">${formatarDataRelativa(t.data)}</span>
        ${t.notaProfPos?`<span class="card-badge badge-white" style="font-size:10px">${escapeHtml(t.notaProfPos)}</span>`:''}
      </div>
      <div style="font-size:13px;line-height:1.5">${escapeHtml(t.notaProf)}</div>
    </div>`).join('');
}
function renderMetasView(tipo, ud){
  const el=document.getElementById(`metas-${tipo==='semanal'?'semanais':'mensais'}-view`);
  const metas=ud.metas[tipo]||[];
  const now=new Date();
  const t=treinosDaModalidade(ud);
  const calcProgress=(meta)=>{
    if(meta.label.toLowerCase().includes('treino')){
      if(tipo==='semanal'){
        const start=new Date(now); start.setDate(now.getDate()-now.getDay());
        return t.filter(x=>new Date(x.data)>=start).length;
      } else {
        return t.filter(x=>{const d=new Date(x.data);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).length;
      }
    }
    if(meta.label.toLowerCase().includes('final')){
      const month=t.filter(x=>{const d=new Date(x.data);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});
      return month.reduce((a,x)=>a+(x.stats.finAp||0),0);
    }
    if(meta.label.toLowerCase().includes('hora')){
      const start=tipo==='semanal'?new Date(now-(now.getDay()*86400000)):new Date(now.getFullYear(),now.getMonth(),1);
      const mins=t.filter(x=>new Date(x.data)>=start).reduce((a,x)=>a+calcMins(x),0);
      return parseFloat((mins/60).toFixed(1));
    }
    if(meta.label.toLowerCase().includes('sparring')){
      const start=new Date(now); start.setDate(now.getDate()-now.getDay());
      return t.filter(x=>x.tipo==='sparring'&&new Date(x.data)>=start).length;
    }
    return 0;
  };
  el.innerHTML=metas.map(m=>{
    const actual=calcProgress(m);
    const pct=Math.min(100,Math.round((actual/m.meta)*100));
    const done=pct>=100;
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span>${m.label} (${actual}/${m.meta} ${m.unidade})</span>
        <span style="color:${done?'var(--teal)':'var(--gold)'};font-weight:600">${done?'✓ Completo':pct+'%'}</span>
      </div>
      <div class="lv-bar"><div class="lv-fill" style="width:${pct}%;background:${done?'var(--teal)':'var(--red)'}"></div></div>
    </div>`;
  }).join('');
}

function renderFisico(ud){
  const f=ud.fisico||{};
  const h=ud.profile.altura||0;
  const imc=h>0?parseFloat((f.peso/(((h/100)**2))).toFixed(1)):0;
  const imcLabel=imc>0?(imc<18.5?'Abaixo do peso':imc<25?'Peso normal ✓':imc<30?'Sobrepeso':'Obesidade'):'—';
  const fields=[
    {icon:'ti-scale', bg:'var(--red-dim)', c:'var(--red)', val:f.peso?`${f.peso} <small>kg</small>`:'—', label:f.pesoMeta?`Peso atual · Meta: ${f.pesoMeta}kg`:'Peso atual'},
    {icon:'ti-activity', bg:'rgba(255,255,255,.06)', c:'rgba(255,255,255,.6)', val:imc>0?`${imc} <small>IMC</small>`:'—', label:imcLabel},
    {icon:'ti-percentage', bg:'var(--gold-dim)', c:'var(--gold)', val:f.gordura?`${f.gordura} <small>%</small>`:'—', label:'% de gordura'},
    {icon:'ti-moon', bg:'var(--teal-dim)', c:'var(--teal)', val:f.sono?`${f.sono} <small>h</small>`:'—', label:'Sono noite anterior'},
    {icon:'ti-droplet', bg:'rgba(255,255,255,.06)', c:'rgba(255,255,255,.6)', val:f.hidra?`${f.hidra} <small>L</small>`:'—', label:`Hidratação hoje${f.hidra&&f.pesoMeta?' · Meta: 3L':''}` },
    {icon:'ti-heartbeat', bg:'var(--red-dim)', c:'var(--red)', val:f.fc?`${f.fc} <small>bpm</small>`:'—', label:'FC repouso'+((f.fc&&f.fc<60)?' · Atlético ✓':'')},
  ];
  document.getElementById('phys-grid').innerHTML=fields.map(x=>`
    <div class="phys-card">
      <div class="phys-icon" style="background:${x.bg};color:${x.c}"><i class="ti ${x.icon}"></i></div>
      <div><div class="phys-val">${x.val}</div><div class="phys-label">${x.label}</div></div>
    </div>`).join('');
  const hist=f.historia||[];
  if(charts.peso) charts.peso.destroy();
  if(hist.length>1){
    charts.peso=new Chart(document.getElementById('pesoChart'),{
      type:'line',
      data:{
        labels:hist.map(h=>new Date(h.data+'T12:00').toLocaleDateString('pt-BR',{month:'short',day:'2-digit'})),
        datasets:[{label:'Peso (kg)',data:hist.map(h=>h.peso),borderColor:'var(--red)',backgroundColor:'rgba(215,38,56,.08)',fill:true,tension:.4,pointBackgroundColor:'var(--red)',pointRadius:4,pointHoverRadius:7}]
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
        x:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}},
        y:{grid:{color:'rgba(215,38,56,.05)'},ticks:{color:'rgba(245,239,239,.4)',font:{size:11}}}
      }}
    });
  } else {
    if(charts.peso) charts.peso.destroy();
    const ctx=document.getElementById('pesoChart').getContext('2d');
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle='rgba(245,239,239,.3)';ctx.font='13px DM Sans';ctx.textAlign='center';
    ctx.fillText('Atualize seu peso para ver a evolução aqui.',ctx.canvas.width/2,50);
  }
}

function renderComps(ud){
  const comps=compsDaModalidade(ud);
  const active=comps.filter(c=>c.status!=='finalizado');
  const hist=comps.filter(c=>c.status==='finalizado');
  const cl=document.getElementById('comps-list');
  if(!active.length){
    cl.innerHTML=`<div class="card" style="margin-bottom:12px;text-align:center;padding:24px;color:var(--muted);font-size:13px"><i class="ti ti-calendar-event" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>Nenhuma competição agendada.<br><span style="color:var(--red);cursor:pointer;font-weight:600" onclick="openAddComp()">Adicionar competição</span></div>`;
  } else {
    cl.innerHTML=active.map(c=>{
      const diff=Math.ceil((new Date(c.data)-new Date(today()))/(86400000));
      const pct=Math.max(0,Math.min(100,Math.round((1-diff/90)*100)));
      return `<div class="comp-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div class="comp-title">${escapeHtml(c.nome)}</div>
            <div class="comp-date">${new Date(c.data+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})} · ${escapeHtml(c.local)}</div>
            <div style="margin-top:7px">
              <span class="card-badge badge-red">${c.status==='proximo'?'Próximo':'Planejado'}</span>
              ${c.cat?`<span class="card-badge badge-gold" style="margin-left:4px">${escapeHtml(c.cat)}</span>`:''}
            </div>
          </div>
          <div>
            <div class="countdown">${diff>=0?diff:'—'}<span>dias restantes</span></div>
            <button class="btn-sm" style="font-size:10px;padding:3px 8px;margin-top:6px;float:right" onclick="removeComp('${c.id}')"><i class="ti ti-trash" style="font-size:11px"></i></button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px"><span>Preparação</span><span>${pct}%</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }
  const hl=document.getElementById('hist-list');
  const medals=hist.filter(c=>c.resultado);
  document.getElementById('medal-count').textContent=medals.length+' medalha'+(medals.length!==1?'s':'');
  if(!hist.length){
    hl.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;opacity:.6">Nenhuma competição finalizada ainda.</div>';
  } else {
    const medalColors={ouro:{bg:'var(--gold-dim)',bc:'rgba(244,185,66,.3)',ic:'var(--gold)',lbl:'Ouro'},
      prata:{bg:'var(--card2)',bc:'var(--border)',ic:'#b0b8c1',lbl:'Prata'},
      bronze:{bg:'var(--card2)',bc:'var(--border)',ic:'#cd7f32',lbl:'Bronze'}};
    hl.innerHTML=hist.reverse().map(c=>{
      const m=medalColors[c.resultado]||{bg:'var(--card2)',bc:'var(--border)',ic:'var(--muted)',lbl:'—'};
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${m.bg};border-radius:10px;border:1px solid ${m.bc}">
        <i class="ti ti-medal" style="font-size:22px;color:${m.ic}"></i>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${escapeHtml(c.nome)}</div>
          <div style="font-size:11px;color:var(--muted)">${new Date(c.data+'T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})} · ${escapeHtml(c.cat||'—')}</div>
        </div>
        <div style="font-family:var(--font-d);font-size:16px;font-weight:700;color:${m.ic}">${c.resultado?m.lbl:'—'}</div>
        <button class="btn-sm" style="font-size:10px;padding:3px 7px" onclick="removeComp('${c.id}')"><i class="ti ti-trash" style="font-size:10px"></i></button>
      </div>`;
    }).join('');
  }
}

function detectarPlato(ud){
  const el=document.getElementById('ia-plato');
  if(!el) return;
  const t=treinosDaModalidade(ud);
  const now=new Date();
  const d30=new Date(now); d30.setDate(now.getDate()-30);
  const d60=new Date(now); d60.setDate(now.getDate()-60);
  const recente=t.filter(x=>new Date(x.data)>=d30);
  const anterior=t.filter(x=>{const d=new Date(x.data); return d>=d60 && d<d30});
  if(recente.length<3 || anterior.length<3){
    el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:8px">Registre pelo menos 3 treinos nos últimos 30 dias e 3 nos 30 dias anteriores para detectar platôs.</div>';
    return;
  }
  const agg=(lista,ap,sf)=>lista.reduce((acc,x)=>{acc.a+=(x.stats?.[ap]||0);acc.s+=(x.stats?.[sf]||0);return acc},{a:0,s:0});
  const achados=[];
  POSICOES_DEFS.forEach(p=>{
    const r=agg(recente,p.ap,p.sf), an=agg(anterior,p.ap,p.sf);
    const volR=r.a+r.s, volA=an.a+an.s;
    if(volR<3 || volA<3) return;
    const ratioR=r.a/volR, ratioA=an.a/volA;
    const cresceuVolume = volR >= volA*1.15;
    const estagnou = ratioR <= ratioA + 0.03;
    if(cresceuVolume && estagnou){
      achados.push(`Em <strong>${p.nome}</strong>, seu volume subiu de ${volA} para ${volR} disputas, mas o aproveitamento ficou parado em ~${Math.round(ratioR*100)}% (era ${Math.round(ratioA*100)}%). Sinal de platô — considere trocar o tipo de treino ou pedir correção técnica nessa posição.`);
    }
  });
  const treinosVolR=recente.length, treinosVolA=anterior.length;
  const saldoR=recente.reduce((a,x)=>a+(x.stats?.saldoBJJ??calcSaldoBJJ(x.stats||{})),0);
  const saldoA=anterior.reduce((a,x)=>a+(x.stats?.saldoBJJ??calcSaldoBJJ(x.stats||{})),0);
  if(treinosVolR >= treinosVolA*1.15 && saldoR<=saldoA){
    achados.push(`Você treinou mais nos últimos 30 dias (${treinosVolR} vs ${treinosVolA}), mas o saldo geral de pontos não acompanhou (${saldoR>0?'+':''}${saldoR} vs ${saldoA>0?'+':''}${saldoA} antes). Mais volume sem ganho de performance pode indicar fadiga acumulada ou treino no automático.`);
  }
  el.innerHTML = achados.length
    ? achados.map(a=>`<div style="font-size:12.5px;line-height:1.6;padding:9px 11px;background:var(--gold-dim);border-radius:8px;border:1px solid rgba(244,185,66,.25)"><i class="ti ti-alert-triangle" style="color:var(--gold);margin-right:6px"></i>${a}</div>`).join('')
    : '<div style="font-size:12.5px;color:var(--teal);padding:9px 11px;background:var(--teal-dim);border-radius:8px"><i class="ti ti-trending-up" style="margin-right:6px"></i>Nenhum sinal de platô nos últimos 30 dias — sua evolução está acompanhando o volume de treino.</div>';
}
function renderIA(ud){
  const t=treinosDaModalidade(ud);
  detectarPlato(ud);
  renderPlanoAcao(ud);
  if(!t.length){
    document.getElementById('ia-resumo').textContent='Registre treinos para receber análises personalizadas.';
    document.getElementById('ia-fortes').innerHTML='<div style="font-size:12px;color:var(--muted);padding:8px;background:var(--teal-dim);border-radius:8px">Dados insuficientes ainda.</div>';
    document.getElementById('ia-fraquezas').innerHTML='<div style="font-size:12px;color:var(--muted);padding:8px;background:var(--red-dim);border-radius:8px">Dados insuficientes ainda.</div>';
    document.getElementById('ia-recs').innerHTML='<div style="font-size:13px;color:var(--muted);padding:16px;text-align:center">Registre pelo menos 3 treinos para ver recomendações.</div>';
    return;
  }
  const mes=new Date().getMonth();
  const treinosMes=t.filter(x=>new Date(x.data).getMonth()===mes);
  const totFin=t.reduce((a,x)=>a+(x.stats.finAp||0),0);
  const totSf=t.reduce((a,x)=>a+(x.stats.finSf||0),0);
  const streak=calcStreak(t);
  const xpData=calcXPLevel(ud.xp||0);
  const avgInt=(t.reduce((a,x)=>a+(x.intensidade||5),0)/t.length).toFixed(1);
  const sparringCount=t.filter(x=>x.tipo==='sparring').length;
  const rate=totFin+totSf>0?Math.round(totFin/(totFin+totSf)*100):0;
  document.getElementById('ia-resumo').innerHTML=`Você tem <strong style="color:#fff">${t.length} treino(s) registrado(s)</strong> e acumulou <strong style="color:#fff">${ud.xp||0} XP</strong> no nível ${xpData.lv} (${xpData.name}). Este mês foram <strong style="color:#fff">${treinosMes.length} treino(s)</strong> com <strong style="color:#fff">${totFin} finalizações aplicadas</strong>.`;
  const fortes=[];
  const fracas=[];
  if(streak>=3) fortes.push(`Streak de ${streak} dias consecutivos — consistência excelente!`);
  if(rate>=70) fortes.push(`Taxa de finalização de ${rate}% — acima da média`);
  if(totFin>=20) fortes.push(`${totFin} finalizações aplicadas — jogo ofensivo forte`);
  if(avgInt>=7) fortes.push(`Intensidade média de ${avgInt}/10 — alta entrega nos treinos`);
  if(sparringCount>=t.length*0.4) fortes.push(`${sparringCount} sessões de sparring — bom volume`);
  if(streak<3) fracas.push(`Streak baixo (${streak} dia(s)) — tente treinar mais dias seguidos`);
  if(rate<50&&totFin+totSf>5) fracas.push(`Taxa de finalização de ${rate}% — trabalhe suas finalizações`);
  if(totSf>totFin&&t.length>3) fracas.push(`Finalizações sofridas (${totSf}) maior que aplicadas — foque na defesa`);
  if(avgInt<5) fracas.push(`Intensidade média baixa (${avgInt}/10) — considere aumentar a intensidade`);
  document.getElementById('ia-fortes').innerHTML=fortes.length?fortes.map(f=>`<div style="display:flex;align-items:center;gap:9px;font-size:13px;padding:8px 10px;background:var(--teal-dim);border-radius:8px"><i class="ti ti-check" style="color:var(--teal)"></i>${f}</div>`).join(''):'<div style="font-size:12px;color:var(--muted);padding:8px;background:var(--teal-dim);border-radius:8px">Continue treinando para ver seus pontos fortes!</div>';
  document.getElementById('ia-fraquezas').innerHTML=fracas.length?fracas.map(f=>`<div style="display:flex;align-items:center;gap:9px;font-size:13px;padding:8px 10px;background:var(--red-dim);border-radius:8px"><i class="ti ti-alert-triangle" style="color:var(--red)"></i>${f}</div>`).join(''):'<div style="font-size:12px;color:var(--muted);padding:8px;background:var(--red-dim);border-radius:8px">Nenhuma fraqueza identificada — ótimo trabalho!</div>';
  const recs=[];
  if(xpData.xpForNext>0) recs.push({icon:'ti-chart-line',bg:'var(--teal-dim)',c:'var(--teal)',title:`Nível ${xpData.lv+1} em ${Math.ceil(xpData.xpForNext/50)} treinos`,desc:`Você precisa de ${xpData.xpForNext} XP. Continue registrando treinos e finalizações!`});
  if(streak<7) recs.push({icon:'ti-flame',bg:'var(--red-dim)',c:'var(--red)',title:`Conquista: Streak de 7 dias`,desc:`Você está há ${streak} dia(s). Treine por ${7-streak} dia(s) seguido(s) para desbloquear!`});
  if(totFin<10) recs.push({icon:'ti-target',bg:'var(--gold-dim)',c:'var(--gold)',title:'Meta: 10 finalizações aplicadas',desc:`Você tem ${totFin} finalizações. Foque em trabalhar seus ataques no sparring.`});
  if(!recs.length) recs.push({icon:'ti-bulb',bg:'var(--gold-dim)',c:'var(--gold)',title:'Excelente evolução!',desc:'Continue registrando treinos para insights mais precisos sobre seu desenvolvimento.'});
  document.getElementById('ia-recs').innerHTML=recs.map(r=>`
    <div class="ai-insight">
      <div class="ai-icon" style="background:${r.bg};color:${r.c}"><i class="ti ${r.icon}"></i></div>
      <div class="ai-text"><strong>${r.title}</strong><p>${r.desc}</p></div>
    </div>`).join('');
}
function garantirPlanoAcao(ud){
  if(!ud.planoAcaoFeito) ud.planoAcaoFeito={};
  return ud.planoAcaoFeito;
}
function filterPeriodoDias(treinos,dias){
  const limite=new Date(); limite.setDate(limite.getDate()-dias);
  return (treinos||[]).filter(t=>new Date(t.data)>=limite);
}
const PLANO_COR_MAP={ red:'var(--red)', gold:'var(--gold)', teal:'var(--teal)' };
function gerarRecomendacoesInteligentes(ud){
  const t=treinosDaModalidade(ud);
  const now=new Date();
  const recs=[];

  const d7=new Date(now); d7.setDate(now.getDate()-7);
  const d14=new Date(now); d14.setDate(now.getDate()-14);
  const d56=new Date(now); d56.setDate(now.getDate()-56);
  const semanaAtual=t.filter(x=>new Date(x.data)>=d7);
  const media8sem=t.filter(x=>new Date(x.data)>=d56).length/8;
  if(media8sem>=1 && semanaAtual.length < media8sem*0.6){
    recs.push({
      id:'consistencia_queda', pri:'alta', icon:'ti-trending-down', cor:'red',
      titulo:'Frequência caiu nesta semana',
      desc:`Você treinou ${semanaAtual.length}x nos últimos 7 dias, contra uma média de ${media8sem.toFixed(1)}x/semana nas últimas 8 semanas. Tente encaixar mais uma sessão até o fim da semana para não perder ritmo.`
    });
  }

  const ultimos3=[...t].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,3);
  const streakAtual=calcStreak(t);
  const intMedia3=ultimos3.length?ultimos3.reduce((a,x)=>a+(x.intensidade||5),0)/ultimos3.length:0;
  if(streakAtual>=5 && intMedia3>=8){
    recs.push({
      id:'overtraining', pri:'alta', icon:'ti-alert-triangle', cor:'gold',
      titulo:'Risco de sobrecarga',
      desc:`Streak de ${streakAtual} dias com intensidade média de ${intMedia3.toFixed(1)}/10 nos últimos treinos. Considere uma sessão mais leve ou um dia de descanso para recuperar.`
    });
  }

  const t30=filterPeriodoDias(t,30);
  const agg=(ap,sf)=>t30.reduce((acc,x)=>{acc.a+=(x.stats?.[ap]||0);acc.s+=(x.stats?.[sf]||0);return acc},{a:0,s:0});
  const posRank=POSICOES_DEFS.map(p=>{
    const {a,s}=agg(p.ap,p.sf); const total=a+s;
    return {...p,ratio:total>0?a/total:null,total};
  }).filter(p=>p.total>=3).sort((a,b)=>a.ratio-b.ratio);
  if(posRank.length){
    const pior=posRank[0];
    recs.push({
      id:'posicao_fraca_'+pior.ap, pri:'media', icon:'ti-map-2', cor:'red',
      titulo:`Foco técnico: ${pior.nome}`,
      desc:`Nos últimos 30 dias seu aproveitamento em ${pior.nome} foi de ${Math.round(pior.ratio*100)}%. Peça ao professor alguns minutos de drilling focado nessa posição no próximo treino.`
    });
  }

  const t30sparring=t30.filter(x=>x.tipo==='sparring').length;
  if(t30.length>=4 && (t30sparring/t30.length)<0.2){
    recs.push({
      id:'pouco_sparring', pri:'media', icon:'ti-swords', cor:'teal',
      titulo:'Poucas sessões de sparring',
      desc:`Só ${t30sparring} de ${t30.length} treinos nos últimos 30 dias foram sparring. Rolar mais é o jeito mais rápido de testar o que você tem treinado na técnica.`
    });
  }

  const comps=compsDaModalidade(ud).filter(c=>c.status!=='finalizado');
  const proxima=comps.map(c=>({...c,dias:Math.ceil((new Date(c.data)-now)/86400000)})).filter(c=>c.dias>=0).sort((a,b)=>a.dias-b.dias)[0];
  if(proxima && proxima.dias<=30){
    recs.push({
      id:'comp_prep_'+proxima.id, pri:'alta', icon:'ti-medal', cor:'gold',
      titulo:`${proxima.nome} em ${proxima.dias} dia(s)`,
      desc:'Priorize sparring de alta intensidade e simulação de round de competição nas próximas semanas, e confira seu peso na aba Competições.'
    });
  }

  const totFinAp=t30.reduce((a,x)=>a+(x.stats?.finAp||0),0);
  const totFinSf=t30.reduce((a,x)=>a+(x.stats?.finSf||0),0);
  if(totFinSf>totFinAp && (totFinAp+totFinSf)>=5){
    recs.push({
      id:'defesa_fraca', pri:'media', icon:'ti-shield', cor:'red',
      titulo:'Defesa precisa de atenção',
      desc:`Você sofreu ${totFinSf} finalizações contra ${totFinAp} aplicadas nos últimos 30 dias. Vale treinar escapes antes de buscar a submissão.`
    });
  }

  const semNotas=t30.filter(x=>!x.notaProf).length;
  if(t30.length>=4 && semNotas===t30.length){
    recs.push({
      id:'sem_notas', pri:'baixa', icon:'ti-chalkboard', cor:'teal',
      titulo:'Registre as correções do professor',
      desc:'Nenhum treino recente tem uma nota de correção salva. Anotar o feedback ajuda a acompanhar sua evolução técnica real.'
    });
  }

  const ordem={alta:0,media:1,baixa:2};
  return recs.sort((a,b)=>ordem[a.pri]-ordem[b.pri]).slice(0,6);
}
function renderPlanoAcao(ud){
  const listEl=document.getElementById('plano-lista');
  const statsEl=document.getElementById('plano-stats');
  if(!listEl) return;
  const feitos=garantirPlanoAcao(ud);
  const recs=gerarRecomendacoesInteligentes(ud);
  const priCount={alta:0,media:0,baixa:0};
  recs.forEach(r=>priCount[r.pri]++);
  if(statsEl){
    statsEl.innerHTML=`
      <span class="plano-chip"><i class="ti ti-alert-circle" style="color:var(--red)"></i>${priCount.alta} alta prioridade</span>
      <span class="plano-chip"><i class="ti ti-info-circle" style="color:var(--gold)"></i>${priCount.media} média</span>
      <span class="plano-chip"><i class="ti ti-circle-check" style="color:var(--teal)"></i>${priCount.baixa} baixa</span>`;
  }
  if(!recs.length){
    listEl.innerHTML=`<div class="plano-empty"><i class="ti ti-mood-smile"></i>Nenhum ponto crítico identificado agora. Continue registrando treinos para manter o plano atualizado!</div>`;
    return;
  }
  listEl.innerHTML=recs.map(r=>{
    const done=!!feitos[r.id];
    return `<div class="plano-item pri-${r.pri} ${done?'done':''}" id="plano-item-${r.id}">
      <div class="plano-icon" style="background:var(--${r.cor}-dim);color:${PLANO_COR_MAP[r.cor]}"><i class="ti ${r.icon}"></i></div>
      <div class="plano-body">
        <div class="plano-top-row">
          <span class="plano-titulo">${escapeHtml(r.titulo)}</span>
          <span class="plano-pri-badge pri-${r.pri}">${r.pri}</span>
        </div>
        <div class="plano-desc">${escapeHtml(r.desc)}</div>
        <div class="plano-actions">
          <button type="button" class="plano-check ${done?'checked':''}" aria-label="Marcar como feito" onclick="togglePlanoItem('${r.id}')"><i class="ti ti-check"></i></button>
          <span style="font-size:11px;color:var(--muted)">${done?'Concluído':'Marcar como feito'}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
function togglePlanoItem(id){
  const ud=getUserData();
  const feitos=garantirPlanoAcao(ud);
  feitos[id]=!feitos[id];
  saveUserData(ud);
  renderPlanoAcao(ud);
}
window.togglePlanoItem = togglePlanoItem;
let remoteDirCache = {};

async function fetchRemoteDirectory(){
  const client=getClient();
  if(!client) return null;
  try{
    const { data, error } = await client.from('lifejiu_public_stats').select('id,nome,faixa,academia,xp,streak,treinos_semana,updated_at');
    if(error) throw error;
    return data||[];
  }catch(err){
    console.error('Erro ao buscar diretório remoto do Supabase:', err);
    return null;
  }
}
function computeUserStats(ud){
  const wk=weekKey();
  return {
    nome: ud.profile?.nome||'',
    faixa: ud.profile?.faixa||'Branca',
    academia: ud.profile?.academia||'',
    xp: ud.xp||0,
    streak: calcStreak(ud.treinos||[]),
    treinosSemana: (ud.treinos||[]).filter(t=>weekKeyOf(t.data)===wk).length
  };
}
function getStatsFor(email){
  if(email===CU) return computeUserStats(getUserData());
  if(remoteDirCache[email]) return remoteDirCache[email];
  const local = STORE.get('ud_'+email);
  if(local) return computeUserStats(local);
  const users=getAllUsers();
  return { nome: users[email]?.nome||'Atleta', faixa:'Branca', academia:'', xp:0, streak:0, treinosSemana:0 };
}
async function renderSocial(ud){
  if(getClient()){
    const remote = await fetchRemoteDirectory();
    if(remote){
      const novoCache={};
      remote.forEach(r=>{ if(r.id) novoCache[r.id]={ nome:r.nome||'Atleta', faixa:r.faixa||'Branca', academia:r.academia||'', xp:r.xp||0, streak:r.streak||0, treinosSemana:r.treinos_semana||0 }; });
      remoteDirCache=novoCache;
    }
  }
  const users = getAllUsers();
  const emails = Array.from(new Set([...Object.keys(users), ...Object.keys(remoteDirCache), CU]));
  const minhaAcademia = (ud.profile.academia||'').trim().toLowerCase();
  const soAcademia = document.getElementById('rank-filter-academia')?.checked;
  let entries = emails.map(email=>{
    const s = getStatsFor(email);
    return { email, nome: s.nome||users[email]?.nome||'Atleta', academia: s.academia||'', faixa: s.faixa||'Branca', xp: s.xp||0 };
  });
  if(soAcademia && minhaAcademia) entries = entries.filter(e=>(e.academia||'').trim().toLowerCase()===minhaAcademia);
  entries.sort((a,b)=>b.xp-a.xp);
  const medalhas=['🥇','🥈','🥉'];
  document.getElementById('rank-list').innerHTML = entries.length ? entries.map((e,i)=>`
    <div class="rank-item ${e.email===CU?'me':''}">
      <div class="rank-pos" style="color:${i<3?'var(--gold)':'var(--muted)'}">${medalhas[i]||(i+1)}</div>
      <div class="rank-av" style="background:linear-gradient(135deg,var(--red),var(--red-deep))">${escapeHtml(initials(e.nome))}</div>
      <div class="rank-name" style="font-weight:${e.email===CU?700:500}">${escapeHtml(e.nome)}${e.email===CU?' (você)':''} <span class="rank-belt" style="color:rgba(245,239,239,.6)">Faixa ${escapeHtml(e.faixa)}${e.academia?' · '+escapeHtml(e.academia):''}</span></div>
      <div class="rank-xp">${e.xp} xp</div>
    </div>`).join('') : `<div style="padding:12px 14px;text-align:center;font-size:12px;color:var(--muted)">Nenhum atleta encontrado com esse filtro.</div>`;
  if(entries.length<=1){
    document.getElementById('rank-list').innerHTML += `
    <div style="padding:12px 14px;margin-top:8px;text-align:center;font-size:12px;color:var(--muted);border:1px dashed var(--border);border-radius:var(--radius-sm)">
      ${getClient()?'Convide seus parceiros de academia a criar uma conta e sincronizar com o Supabase para entrarem no ranking com você!':'Convide seus parceiros de academia a criar uma conta neste app para entrarem no ranking com você! Configure o Supabase em Ajustes para o ranking funcionar entre aparelhos diferentes.'}
    </div>`;
  }
  renderChallenges(ud);
  renderParceiros(ud);
  populateDueloSelect(emails);
}
function renderParceiros(ud){
  const el=document.getElementById('parceiros-list');
  if(!el) return;
  const t=treinosDaModalidade(ud);
  const grupos={};
  t.forEach(tr=>{
    const nome=(tr.parceiro||'').trim();
    if(!nome) return;
    const key=nome.toLowerCase();
    if(!grupos[key]) grupos[key]={nome, count:0, ultima:tr.data};
    grupos[key].count++;
    if(new Date(tr.data)>new Date(grupos[key].ultima)) grupos[key].ultima=tr.data;
  });
  const lista=Object.values(grupos).sort((a,b)=>new Date(b.ultima)-new Date(a.ultima));
  if(!lista.length){
    el.innerHTML=`<div style="text-align:center;padding:18px;color:var(--muted);font-size:12.5px">Registre o "Parceiro" ao salvar um treino para acompanhar com quem você mais rola aqui.</div>`;
    return;
  }
  el.innerHTML=lista.map(p=>{
    const dias=Math.round((new Date()-new Date(p.ultima+'T12:00'))/86400000);
    const alerta=dias>=14;
    return `<div class="partner-item">
      <div class="partner-av">${escapeHtml(initials(p.nome))}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${escapeHtml(p.nome)}</div>
        <div style="font-size:11.5px;color:${alerta?'var(--gold)':'var(--muted)'}">${p.count} treino(s) juntos · última vez: ${formatarDataRelativa(p.ultima)}${alerta?' · já faz um tempo!':''}</div>
      </div>
    </div>`;
  }).join('');
}
function populateDueloSelect(emails){
  const sel=document.getElementById('duelo-select');
  if(!sel) return;
  const atual=sel.value;
  const users=getAllUsers();
  const outros=emails.filter(e=>e!==CU);
  sel.innerHTML='<option value="">Escolha um atleta para desafiar...</option>'+outros.map(email=>{
    const s=getStatsFor(email);
    const nome=s.nome||users[email]?.nome||email;
    return `<option value="${escapeHtml(email)}">${escapeHtml(nome)}</option>`;
  }).join('');
  if(outros.includes(atual)) sel.value=atual;
}
function renderDuelo(){
  const box=document.getElementById('duelo-result');
  const email=document.getElementById('duelo-select')?.value;
  if(!box) return;
  if(!email){ box.innerHTML=''; return; }
  const meu=computeUserStats(getUserData());
  const dele=getStatsFor(email);
  const nomeDele=dele.nome||'Atleta';
  const treinosSemanaMeus=meu.treinosSemana;
  const treinosSemanaDele=dele.treinosSemana;
  const streakMeu=meu.streak;
  const streakDele=dele.streak;
  const cor=(a,b)=>a>b?'var(--teal)':a<b?'var(--red)':'var(--muted)';
  box.innerHTML=`
    <div class="duelo-vs">
      <div class="duelo-side">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Você</div>
        <div class="duelo-stat" style="color:${cor(treinosSemanaMeus,treinosSemanaDele)}">${treinosSemanaMeus}</div>
        <div style="font-size:10.5px;color:var(--muted)">treinos essa semana</div>
      </div>
      <div style="font-family:var(--font-d);font-size:13px;color:var(--muted)">VS</div>
      <div class="duelo-side">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${escapeHtml(nomeDele)}</div>
        <div class="duelo-stat" style="color:${cor(treinosSemanaDele,treinosSemanaMeus)}">${treinosSemanaDele}</div>
        <div style="font-size:10.5px;color:var(--muted)">treinos essa semana</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:9px 11px;background:var(--card2);border:1px solid var(--border);border-radius:9px;margin-bottom:7px">
      <span>Streak atual</span><span><strong style="color:${cor(streakMeu,streakDele)}">${streakMeu}</strong> x <strong style="color:${cor(streakDele,streakMeu)}">${streakDele}</strong> dias</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:9px 11px;background:var(--card2);border:1px solid var(--border);border-radius:9px">
      <span>XP total</span><span><strong style="color:${cor(meu.xp||0,dele.xp||0)}">${meu.xp||0}</strong> x <strong style="color:${cor(dele.xp||0,meu.xp||0)}">${dele.xp||0}</strong></span>
    </div>`;
}

function weekKey(){
  const d=new Date(); const onejan=new Date(d.getFullYear(),0,1);
  const week=Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7);
  return `${d.getFullYear()}-W${week}`;
}
const CHALLENGE_POOL=[
  {id:'treinos4',label:'Treinar 4x nesta semana',unidade:'treinos',meta:4,xp:60,calc:(t)=>t.length,icon:'ti-calendar-check'},
  {id:'fin8',label:'Aplicar 8 finalizações nesta semana',unidade:'fin.',meta:8,xp:80,calc:(t)=>t.reduce((a,x)=>a+(x.stats?.finAp||0),0),icon:'ti-target'},
  {id:'spar3',label:'Fazer 3 sessões de sparring',unidade:'sessões',meta:3,xp:70,calc:(t)=>t.filter(x=>x.tipo==='sparring').length,icon:'ti-swords'},
  {id:'horas5',label:'Treinar 5 horas na semana',unidade:'h',meta:5,xp:90,calc:(t)=>Math.floor(totalMinutes(t)/60),icon:'ti-clock-hour-4'},
];
function pickWeeklyChallenges(){
  const wk=weekKey();
  let seed=0; for(const c of wk) seed=(seed*31+c.charCodeAt(0))%1000;
  const idxA=seed%CHALLENGE_POOL.length;
  const idxB=(seed+2)%CHALLENGE_POOL.length;
  const picks=[CHALLENGE_POOL[idxA]]; if(idxB!==idxA) picks.push(CHALLENGE_POOL[idxB]);
  return picks;
}
function renderChallenges(ud){
  const wk=weekKey();
  const treinosSemana=(ud.treinos||[]).filter(t=>weekKeyOf(t.data)===wk);
  ud.challenges=ud.challenges||{};
  const picks=pickWeeklyChallenges();
  const list=document.getElementById('challenges-list');
  list.innerHTML=picks.map(c=>{
    const prog=Math.min(c.meta, c.calc(treinosSemana));
    const pct=Math.min(100,Math.round(prog/c.meta*100));
    const claimedKey=wk+'_'+c.id;
    const claimed=!!ud.challenges[claimedKey];
    const done=prog>=c.meta;
    return `<div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600"><i class="ti ${c.icon}" style="color:var(--gold)"></i>${c.label}</div>
        <span style="font-size:11px;color:var(--muted)">${prog}/${c.meta} ${c.unidade}</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${pct}%;background:${done?'var(--teal)':'var(--gold)'};border-radius:4px"></div>
      </div>
      ${claimed
        ? `<span style="font-size:11px;color:var(--teal)"><i class="ti ti-check"></i> Recompensa coletada (+${c.xp} xp)</span>`
        : done
          ? `<button class="btn-sm" style="background:var(--teal);border:none;color:#04231f" onclick="claimChallenge('${c.id}','${claimedKey}',${c.xp})">Coletar +${c.xp} xp</button>`
          : `<span style="font-size:11px;color:var(--muted)">Continue treinando para completar</span>`}
    </div>`;
  }).join('');
}
function weekKeyOf(dataStr){
  const d=new Date(dataStr); const onejan=new Date(d.getFullYear(),0,1);
  const week=Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7);
  return `${d.getFullYear()}-W${week}`;
}
function claimChallenge(id,claimedKey,xp){
  const ud=getUserData();
  ud.challenges=ud.challenges||{};
  if(ud.challenges[claimedKey]) return;
  ud.challenges[claimedKey]=true;
  ud.xp=(ud.xp||0)+xp;
  saveUserData(ud); refreshAll(); toast(`Desafio concluído! +${xp} xp`);
}

function renderPerfil(ud){
  const p=ud.profile;
  const ini=initials(p.nome||'?');
  document.getElementById('perfil-av').textContent=ini;
  document.getElementById('perfil-nome').textContent=p.nome||'Seu nome';
  document.getElementById('perfil-academia').textContent=(p.academia||'Sua academia')+(p.cidade?' · '+p.cidade:'');
  const spAtual = SPORTS_DB[p.esporte] || SPORTS_DB['jiu-jitsu'];
  document.getElementById('perfil-faixa-badge').innerHTML=`<i class="ti ti-award"></i> ${spAtual.temGraduacao===false?p.faixa:'Faixa '+p.faixa}${p.grau>0?' · '+p.grau+'º Grau':''}${p.anos>0?' · '+p.anos+' anos':''}`;
  const sportBadge = document.getElementById('perfil-sport-badge');
  if(sportBadge){
    const s = SPORTS_DB[p.esporte] || SPORTS_DB['jiu-jitsu'];
    sportBadge.innerHTML = `<i class="ti ${s.icone}"></i> ${escapeHtml(s.nome)}`;
  }
  const t=treinosDaModalidade(ud);
  const mins=totalMinutes(t);
  const totFin=t.reduce((a,x)=>a+(x.stats.finAp||0),0);
  document.getElementById('p-treinos').textContent=t.length;
  document.getElementById('p-horas').innerHTML=`${Math.floor(mins/60)}<span>h</span>`;
  const finLabelEl=document.querySelector('#p-fin')?.closest('.stat-card')?.querySelector('.stat-label');
  const cfgAtual = STATS_DB[p.esporte] || STATS_DB['jiu-jitsu'];
  if(finLabelEl) finLabelEl.textContent = cfgAtual.temFinDef===false ? 'Sessões' : (cfgAtual.findefTitulo?.split(' & ')[0] || 'Finalizações');
  document.getElementById('p-fin').textContent=totFin;
  document.getElementById('p-comps').textContent=compsDaModalidade(ud).length;
  const dg=document.getElementById('perfil-dados-grid');
  const items=[
    ['Faixa',`${p.faixa}${p.grau>0?' · '+p.grau+'º Grau':''}`],
    ['Academia',p.academia||'—'],
    ['Cidade',p.cidade||'—'],
    ['Anos no Jiu',p.anos||'—'],
    ['Peso atual',p.peso?p.peso+' kg':'—'],
    ['Altura',p.altura?p.altura+' cm':'—'],
    ['E-mail',CU||'—'],
    ['XP Total',(ud.xp||0)+' xp'],
  ];
  dg.innerHTML=items.map(([k,v])=>`
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;font-weight:600;margin-bottom:4px">${k}</div>
      <div style="font-size:14px;font-weight:500">${v}</div>
    </div>`).join('');
}
function openEditPerfil(){
  const ud=getUserData(); const p=ud.profile;
  document.getElementById('ep-nome').value=p.nome||'';
  document.getElementById('ep-academia').value=p.academia||'';
  document.getElementById('ep-cidade').value=p.cidade||'';
  populaGraduacoesSelect('ep-faixa', p.esporte, p.faixa);
  const s = SPORTS_DB[p.esporte] || SPORTS_DB['jiu-jitsu'];
  const faixaLabel = document.getElementById('ep-faixa-label');
  if(faixaLabel) faixaLabel.textContent = s.temGraduacao ? 'Faixa / Graduação' : 'Nível';
  document.getElementById('ep-grau').value=p.grau||0;
  document.getElementById('ep-anos').value=p.anos||0;
  document.getElementById('ep-peso').value=p.peso||'';
  openModal('modal-perfil');
}
function savePerfil(){
  const ud=getUserData();
  ud.profile.nome=document.getElementById('ep-nome').value.trim()||ud.profile.nome;
  ud.profile.academia=document.getElementById('ep-academia').value.trim();
  ud.profile.cidade=document.getElementById('ep-cidade').value.trim();
  ud.profile.faixa=document.getElementById('ep-faixa').value;
  ud.profile.grau=parseInt(document.getElementById('ep-grau').value)||0;
  ud.profile.anos=parseInt(document.getElementById('ep-anos').value)||0;
  ud.profile.peso=parseFloat(document.getElementById('ep-peso').value)||0;
  saveUserData(ud); refreshAll(); closeModal('modal-perfil'); toast('Perfil atualizado!');
}
function openEditFisico(){
  const ud=getUserData(); const f=ud.fisico||{};
  document.getElementById('ef-peso').value=f.peso||'';
  document.getElementById('ef-peso-meta').value=f.pesoMeta||'';
  document.getElementById('ef-gordura').value=f.gordura||'';
  document.getElementById('ef-fc').value=f.fc||'';
  document.getElementById('ef-sono').value=f.sono||'';
  document.getElementById('ef-hidra').value=f.hidra||'';
  document.getElementById('ef-altura').value=ud.profile.altura||'';
  openModal('modal-fisico');
}
function saveFisico(){
  const ud=getUserData();
  const peso=parseFloat(document.getElementById('ef-peso').value)||0;
  ud.fisico.peso=peso;
  ud.fisico.pesoMeta=parseFloat(document.getElementById('ef-peso-meta').value)||0;
  ud.fisico.gordura=parseFloat(document.getElementById('ef-gordura').value)||0;
  ud.fisico.fc=parseInt(document.getElementById('ef-fc').value)||0;
  ud.fisico.sono=parseFloat(document.getElementById('ef-sono').value)||0;
  ud.fisico.hidra=parseFloat(document.getElementById('ef-hidra').value)||0;
  ud.profile.altura=parseInt(document.getElementById('ef-altura').value)||ud.profile.altura;
  if(peso>0) ud.fisico.historia=[...(ud.fisico.historia||[]),{data:today(),peso}];
  saveUserData(ud); refreshAll(); closeModal('modal-fisico'); toast('Dados físicos atualizados!');
}
function openEditPos(){
  const ud=getUserData();
  const f=document.getElementById('pos-edit-fields');
  f.innerHTML=(ud.posicoes||[]).map((p,i)=>`
    <div class="fg">
      <label class="fl">${p.nome}</label>
      <input type="number" id="pos-${i}" class="fi" min="0" max="100" value="${p.pct}" placeholder="0–100">
    </div>`).join('');
  openModal('modal-pos');
}
function savePos(){
  const ud=getUserData();
  (ud.posicoes||[]).forEach((p,i)=>{
    const v=parseInt(document.getElementById('pos-'+i)?.value)||0;
    ud.posicoes[i].pct=Math.min(100,Math.max(0,v));
  });
  saveUserData(ud); refreshAll(); closeModal('modal-pos'); toast('Posições atualizadas!');
}
let editingMetasTipo='semanal';
function openEditMetas(tipo){
  editingMetasTipo=tipo;
  const ud=getUserData();
  const metas=ud.metas[tipo]||[];
  document.getElementById('modal-metas-title').innerHTML=`Metas ${tipo==='semanal'?'Semanais':'Mensais'} <button class="modal-close" onclick="closeModal('modal-metas')"><i class="ti ti-x"></i></button>`;
  document.getElementById('metas-edit-fields').innerHTML=metas.map((m,i)=>`
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:13px;margin-bottom:10px">
      <div class="fg"><label class="fl">Descrição</label><input type="text" id="m-label-${i}" class="fi" value="${m.label}"></div>
      <div class="fr">
        <div class="fg"><label class="fl">Meta</label><input type="number" id="m-meta-${i}" class="fi" min="1" value="${m.meta}"></div>
        <div class="fg"><label class="fl">Unidade</label><input type="text" id="m-unidade-${i}" class="fi" value="${m.unidade}"></div>
      </div>
    </div>`).join('');
  openModal('modal-metas');
}
function saveMetas(){
  const ud=getUserData();
  const metas=ud.metas[editingMetasTipo]||[];
  metas.forEach((m,i)=>{
    ud.metas[editingMetasTipo][i].label=document.getElementById(`m-label-${i}`)?.value||m.label;
    ud.metas[editingMetasTipo][i].meta=parseInt(document.getElementById(`m-meta-${i}`)?.value)||m.meta;
    ud.metas[editingMetasTipo][i].unidade=document.getElementById(`m-unidade-${i}`)?.value||m.unidade;
  });
  saveUserData(ud); refreshAll(); closeModal('modal-metas'); toast('Metas atualizadas!');
}
function openAddComp(){
  document.getElementById('c-nome').value='';
  document.getElementById('c-data').value='';
  document.getElementById('c-local').value='';
  document.getElementById('c-cat').value='';
  document.getElementById('c-status').value='planejado';
  document.getElementById('c-resultado').value='';
  document.getElementById('c-resultado-wrap').style.display='none';
  document.getElementById('c-status').onchange=function(){
    document.getElementById('c-resultado-wrap').style.display=this.value==='finalizado'?'block':'none';
  };
  openModal('modal-comp');
}
function saveComp(){
  const nome=document.getElementById('c-nome').value.trim();
  const data=document.getElementById('c-data').value;
  if(!nome||!data){ toast('Nome e data são obrigatórios.','error'); return }
  const ud=getUserData();
  ud.competicoes=ud.competicoes||[];
  ud.competicoes.push({
    id:'c'+Date.now(), nome, data, esporte:ud.profile.esporte||'jiu-jitsu',
    local:document.getElementById('c-local').value.trim(),
    cat:document.getElementById('c-cat').value.trim(),
    status:document.getElementById('c-status').value,
    resultado:document.getElementById('c-status').value==='finalizado'?document.getElementById('c-resultado').value:''
  });
  saveUserData(ud); refreshAll(); closeModal('modal-comp'); toast('Competição adicionada!');
}
function removeComp(id){
  const ud=getUserData();
  ud.competicoes=(ud.competicoes||[]).filter(c=>c.id!==id);
  saveUserData(ud); refreshAll(); toast('Competição removida.');
}

function toggleTheme(light){
  document.documentElement.setAttribute('data-theme', light?'light':'dark');
  STORE.set('theme', light?'light':'dark');
}
function initTheme(){
  const t=STORE.get('theme')||'dark';
  document.documentElement.setAttribute('data-theme', t);
  const cb=document.getElementById('theme-toggle'); if(cb) cb.checked = t==='light';
}
let notifTimer=null;
let swRegistration=null;
async function tentarRegistrarServiceWorker(){
  if(!('serviceWorker' in navigator)) return null;
  try{
    swRegistration = await navigator.serviceWorker.register('./sw.js');
    return swRegistration;
  }catch(e){
    console.warn('Service Worker não registrado (normal se o arquivo estiver aberto direto, sem servidor https):', e);
    return null;
  }
}
async function tentarPeriodicSync(){
  if(!swRegistration || !('periodicSync' in swRegistration)) return false;
  try{
    const status=await navigator.permissions.query({name:'periodic-background-sync'});
    if(status.state==='granted'){
      await swRegistration.periodicSync.register('lifejiu-reminder-check', { minInterval: 12*60*60*1000 });
      return true;
    }
  }catch(e){  }
  return false;
}
function toggleNotifications(on){
  const ud=getUserData();
  const statusEl=document.getElementById('notif-status');
  if(on){
    if(!('Notification' in window)){ toast('Seu navegador não suporta notificações.','error'); document.getElementById('notif-toggle').checked=false; return }
    Notification.requestPermission().then(async perm=>{
      if(perm==='granted'){
        ud.notifOn=true; saveUserData(ud); startNotifTimer(); toast('Lembretes ativados!');
        await tentarRegistrarServiceWorker();
        const periodicOk = await tentarPeriodicSync();
        if(statusEl){
          statusEl.textContent = periodicOk
            ? 'Lembrete reforçado por Service Worker — chance maior de funcionar mesmo com o app em segundo plano.'
            : 'Funcionando enquanto esta aba estiver aberta no navegador. Notificação garantida com o app totalmente fechado exigiria publicar o site num servidor com push real — não é possível num arquivo HTML aberto localmente.';
        }
      } else {
        ud.notifOn=false; saveUserData(ud); document.getElementById('notif-toggle').checked=false; toast('Permissão de notificação negada.','error');
      }
    });
  } else {
    ud.notifOn=false; saveUserData(ud);
    if(notifTimer) clearInterval(notifTimer);
    if(statusEl) statusEl.textContent='';
    toast('Lembretes desativados.');
  }
}
function startNotifTimer(){
  if(notifTimer) clearInterval(notifTimer);
  checkTrainingReminder();
  notifTimer=setInterval(checkTrainingReminder, 60*60*1000);
}
function checkTrainingReminder(){
  const ud=getUserData();
  if(!ud.notifOn) return;
  const last=ud.lastTrainDate;
  const isToday = last===today();
  const hour=new Date().getHours();
  if(!isToday && hour>=18 && Notification.permission==='granted'){
    if(swRegistration){
      swRegistration.showNotification('Life Jiu 🥋', { body:'Você ainda não registrou um treino hoje. Bora pro tatame?' });
    } else {
      new Notification('Life Jiu 🥋', { body:'Você ainda não registrou um treino hoje. Bora pro tatame?' });
    }
  }
}
function initNotifState(){
  const ud=getUserData();
  const cb=document.getElementById('notif-toggle');
  if(cb) cb.checked = !!ud.notifOn;
  if(ud.notifOn && 'Notification' in window && Notification.permission==='granted'){
    startNotifTimer();
    tentarRegistrarServiceWorker().then(()=>tentarPeriodicSync());
  }
}

function downloadFile(filename, content, mime){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
function exportJSON(){
  const ud=getUserData();
  downloadFile(`lifejiu_backup_${today()}.json`, JSON.stringify(ud,null,2), 'application/json');
  toast('Backup exportado!');
}
function exportCSV(){
  const ud=getUserData();
  const treinos=ud.treinos||[];
  if(!treinos.length){ toast('Nenhum treino para exportar.','error'); return }
  const cols=['data','tipo','duracaoMin','intensidade','finAp','finSf','quedas','quedasSf','guard','guardSf','rasp','raspSf','montada','montadaSf','costas','costasSf','saldoBJJ','observacoes'];
  const rows=[cols.join(',')];
  treinos.forEach(t=>{
    const s=t.stats||{};
    rows.push([
      t.data, t.tipo, t.duracaoMin||'', t.intensidade||'',
      s.finAp||0, s.finSf||0,
      s.quedas||0, s.quedasSf||0, s.guard||0, s.guardSf||0,
      s.rasp||0, s.raspSf||0, s.montada||0, s.montadaSf||0, s.costas||0, s.costasSf||0,
      s.saldoBJJ ?? calcSaldoBJJ(s),
      `"${(t.obs||'').replace(/"/g,'""')}"`
    ].join(','));
  });
  downloadFile(`lifejiu_treinos_${today()}.csv`, rows.join('\n'), 'text/csv');
  toast('CSV exportado!');
}
function importJSON(ev){
  const file=ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data || typeof data!=='object' || !data.profile || typeof data.profile!=='object'){
        toast('Arquivo inválido: estrutura de backup não reconhecida.','error'); return;
      }
      if(!confirm('Isso vai sobrescrever todos os seus dados atuais com o backup importado. Continuar?')) return;
      
      
      const base=defaultUserData();
      const safe={
        ...base,
        ...data,
        profile:{ ...base.profile, ...(data.profile||{}) },
        fisico:{ ...base.fisico, ...(data.fisico||{}) },
        treinos: Array.isArray(data.treinos) ? data.treinos : [],
        competicoes: Array.isArray(data.competicoes) ? data.competicoes : [],
        posicoes: Array.isArray(data.posicoes) && data.posicoes.length ? data.posicoes : base.posicoes,
        metas:{
          semanal: Array.isArray(data.metas?.semanal) ? data.metas.semanal : base.metas.semanal,
          mensal: Array.isArray(data.metas?.mensal) ? data.metas.mensal : base.metas.mensal,
        },
        xp: typeof data.xp==='number' ? data.xp : 0,
      };
      saveUserData(safe); refreshAll(); toast('Backup importado com sucesso!');
    }catch(e){ toast('Erro ao ler o arquivo: '+(e?.message||'formato inválido'),'error'); }
  };
  reader.readAsText(file);
  ev.target.value='';
}

function formatarDataRelativa(dataStr){
  const d=new Date(dataStr+'T12:00');
  const hoje=new Date(); hoje.setHours(12,0,0,0);
  const diffDias=Math.round((hoje-d)/86400000);
  if(diffDias===0) return 'Hoje';
  if(diffDias===1) return 'Ontem';
  if(diffDias>1 && diffDias<7) return `Há ${diffDias} dias`;
  return d.toLocaleDateString('pt-BR');
}
let treinosListaExpandida=false;
function toggleTreinosExpand(){
  treinosListaExpandida=!treinosListaExpandida;
  renderTreinosList(getUserData());
}
function renderTreinosList(ud){
  const allRaw=[...treinosDaModalidade(ud)].sort((a,b)=>new Date(b.data)-new Date(a.data));
  const buscaEl=document.getElementById('treinos-busca');
  const busca=(buscaEl?buscaEl.value:'').trim().toLowerCase();
  const all=busca?allRaw.filter(t=>`${t.parceiro||''} ${t.tipo||''} ${t.obs||''} ${t.notaProf||''}`.toLowerCase().includes(busca)):allRaw;
  document.getElementById('treinos-count-badge').textContent=all.length;
  const wrap=document.getElementById('treinos-list');
  const showMoreWrap=document.getElementById('treinos-showmore-wrap');
  if(!allRaw.length){
    wrap.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">
      <i class="ti ti-dumbbell" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
      Nenhum treino registrado ainda.<br>Preencha o formulário acima para começar.
    </div>`;
    if(showMoreWrap) showMoreWrap.style.display='none';
    return;
  }
  if(!all.length){
    wrap.innerHTML=`<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">
      <i class="ti ti-search-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4"></i>
      Nenhum treino encontrado para "${escapeHtml(busca)}".
    </div>`;
    if(showMoreWrap) showMoreWrap.style.display='none';
    return;
  }
  const LIMIT=6;
  const t = treinosListaExpandida ? all : all.slice(0,LIMIT);
  const tiposLabel={tecnica:'Técnica',sparring:'Sparring',competicao:'Competição',fisico:'Prep. Física'};
  const tiposIcon={tecnica:'ti-atom',sparring:'ti-swords',competicao:'ti-medal',fisico:'ti-run'};
  const tiposClasse={tecnica:'ri-tec',sparring:'ri-sp',competicao:'ri-comp',fisico:'ri-fis'};
  wrap.innerHTML=t.map(tr=>{
    const saldo=tr.stats?.saldoBJJ ?? calcSaldoBJJ(tr.stats||{});
    const saldoCor=saldo>0?'var(--teal)':saldo<0?'var(--red)':'var(--muted)';
    const dur=tr.duracaoMin ? formatMin(tr.duracaoMin) : (tr.inicio&&tr.fim?tr.inicio+'–'+tr.fim:'');
    return `
    <div class="rec-item" style="cursor:default">
      <div class="rec-icon ${tiposClasse[tr.tipo]||'ri-tec'}"><i class="ti ${tiposIcon[tr.tipo]||'ti-atom'}"></i></div>
      <div class="rec-info">
        <strong>${formatarDataRelativa(tr.data)} · ${tiposLabel[tr.tipo]||tr.tipo}</strong>
        <span>Intensidade ${tr.intensidade}/10 · Fin. ${tr.stats?.finAp||0}/${tr.stats?.finSf||0} · Saldo <span style="color:${saldoCor};font-weight:600">${saldo>0?'+':''}${saldo}</span>${tr.parceiro?' · com '+escapeHtml(tr.parceiro):''}</span>
      </div>
      <div class="rec-meta">
        ${dur?`<div class="rec-dur">${dur}</div>`:''}
        <div style="display:flex;gap:6px;margin-top:5px">
          <button class="btn-sm" style="padding:5px 8px;border-color:rgba(31,200,180,.3);color:var(--teal)" onclick="event.stopPropagation();exportTreinoCard(${tr.id})" aria-label="Compartilhar treino"><i class="ti ti-share" style="font-size:13px"></i></button>
          <button class="btn-sm" style="padding:5px 8px" onclick="event.stopPropagation();openEditTreino(${tr.id})" aria-label="Editar treino"><i class="ti ti-edit" style="font-size:13px"></i></button>
          <button class="btn-sm" style="padding:5px 8px;border-color:var(--border2);color:var(--red)" onclick="event.stopPropagation();deleteTreino(${tr.id})" aria-label="Excluir treino"><i class="ti ti-trash" style="font-size:13px"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
  if(showMoreWrap){
    showMoreWrap.style.display = all.length>LIMIT ? 'block' : 'none';
    const btn=document.getElementById('treinos-showmore-btn');
    if(btn) btn.textContent = treinosListaExpandida ? 'Mostrar menos' : `Mostrar mais (${all.length-LIMIT})`;
  }
}
let editingTreinoId=null;
function openEditTreino(id){
  const ud=getUserData();
  const tr=(ud.treinos||[]).find(t=>t.id===id);
  if(!tr) return;
  editingTreinoId=id;
  const s=tr.stats||{};
  document.getElementById('et-data').value=tr.data;
  document.getElementById('et-tipo').value=tr.tipo;
  document.getElementById('et-intensidade').value=tr.intensidade;
  document.getElementById('et-finap').value=s.finAp||0;
  document.getElementById('et-finsf').value=s.finSf||0;
  document.getElementById('et-quedas').value=s.quedas||0;
  document.getElementById('et-quedas-sf').value=s.quedasSf||0;
  document.getElementById('et-guard').value=s.guard||0;
  document.getElementById('et-guard-sf').value=s.guardSf||0;
  document.getElementById('et-rasp').value=s.rasp||0;
  document.getElementById('et-rasp-sf').value=s.raspSf||0;
  document.getElementById('et-montada').value=s.montada||0;
  document.getElementById('et-montada-sf').value=s.montadaSf||0;
  document.getElementById('et-costas').value=s.costas||0;
  document.getElementById('et-costas-sf').value=s.costasSf||0;
  document.getElementById('et-parceiro').value=tr.parceiro||'';
  document.getElementById('et-obs').value=tr.obs||'';
  openModal('modal-treino');
}
function saveEditTreino(){
  const ud=getUserData();
  const tr=(ud.treinos||[]).find(t=>t.id===editingTreinoId);
  if(!tr) return;
  tr.data=document.getElementById('et-data').value||tr.data;
  tr.tipo=document.getElementById('et-tipo').value;
  tr.intensidade=parseInt(document.getElementById('et-intensidade').value)||tr.intensidade;
  tr.stats=tr.stats||{};
  tr.stats.finAp=gv('et-finap');
  tr.stats.finSf=gv('et-finsf');
  tr.stats.quedas=gv('et-quedas');
  tr.stats.quedasSf=gv('et-quedas-sf');
  tr.stats.guard=gv('et-guard');
  tr.stats.guardSf=gv('et-guard-sf');
  tr.stats.rasp=gv('et-rasp');
  tr.stats.raspSf=gv('et-rasp-sf');
  tr.stats.montada=gv('et-montada');
  tr.stats.montadaSf=gv('et-montada-sf');
  tr.stats.costas=gv('et-costas');
  tr.stats.costasSf=gv('et-costas-sf');
  tr.stats.saldoBJJ=calcSaldoBJJ(tr.stats);
  tr.parceiro=document.getElementById('et-parceiro').value.trim();
  tr.obs=document.getElementById('et-obs').value.trim();
  saveUserData(ud); refreshAll(); closeModal('modal-treino'); toast('Treino atualizado!');
}
function deleteTreino(id){
  if(!confirm('Excluir este treino? Essa ação não pode ser desfeita.')) return;
  const ud=getUserData();
  ud.treinos=(ud.treinos||[]).filter(t=>t.id!==id);
  saveUserData(ud); refreshAll(); toast('Treino excluído.','error');
}


function exportCartaoAtleta(){
  const ud=getUserData();
  const xpData=calcXPLevel(ud.xp||0);
  const t=ud.treinos||[];
  const totalSaldo=t.reduce((a,x)=>a+(x.stats?.saldoBJJ ?? calcSaldoBJJ(x.stats||{})),0);
  const streak=calcStreak(t);

  const W=1080,H=1350;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');

  
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#1A0D0D'); bg.addColorStop(1,'#0E0A0A');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*0.2,H*0.05,10,W*0.2,H*0.05,W*0.6);
  glow.addColorStop(0,'rgba(255,255,255,.06)'); glow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);

  
  ctx.strokeStyle='rgba(215,38,56,.4)'; ctx.lineWidth=3;
  ctx.strokeRect(24,24,W-48,H-48);

  
  ctx.fillStyle='#D72638'; ctx.font='800 46px Arial';
  ctx.fillText('LIFE JIU', 60, 110);
  ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 22px Arial';
  ctx.fillText('Cartão de Atleta', 60, 148);

  
  ctx.fillStyle='#fff'; ctx.font='800 64px Arial';
  ctx.fillText(ud.profile.nome||'Atleta', 60, 280);
  ctx.fillStyle='#F2B705'; ctx.font='700 30px Arial';
  ctx.fillText(`Faixa ${ud.profile.faixa||'Branca'}${ud.profile.grau?' · '+ud.profile.grau+'º Grau':''}`, 60, 326);
  if(ud.profile.academia){
    ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 24px Arial';
    ctx.fillText(ud.profile.academia, 60, 364);
  }

  
  ctx.strokeStyle='rgba(215,38,56,.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(60,410); ctx.lineTo(W-60,410); ctx.stroke();

  
  const stats=[
    {label:'Nível',value:`${xpData.lv}`,sub:xpData.name,cor:'#D72638'},
    {label:'XP Total',value:`${ud.xp||0}`,sub:'experiência',cor:'#F2B705'},
    {label:'Streak',value:`${streak}`,sub:'dias seguidos',cor:'#1FC8B4'},
    {label:'Treinos',value:`${t.length}`,sub:'registrados',cor:'#fff'},
  ];
  const colW=(W-120)/4;
  stats.forEach((s,i)=>{
    const x=60+colW*i;
    ctx.fillStyle=s.cor; ctx.font='800 56px Arial';
    ctx.fillText(s.value, x, 510);
    ctx.fillStyle='rgba(245,239,239,.45)'; ctx.font='400 20px Arial';
    ctx.fillText(s.label, x, 545);
    ctx.fillStyle='rgba(245,239,239,.3)'; ctx.font='400 16px Arial';
    ctx.fillText(s.sub, x, 568);
  });

  ctx.strokeStyle='rgba(215,38,56,.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(60,610); ctx.lineTo(W-60,610); ctx.stroke();

  
  ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 24px Arial';
  ctx.fillText('SALDO TOTAL DE PONTOS (PONTUAÇÃO OFICIAL)', 60, 680);
  const saldoCor = totalSaldo>0?'#1FC8B4':totalSaldo<0?'#D72638':'#fff';
  ctx.fillStyle=saldoCor; ctx.font='800 130px Arial';
  ctx.fillText(`${totalSaldo>0?'+':''}${totalSaldo}`, 60, 830);

  
  const agg=(ap,sf)=>t.reduce((acc,x)=>{acc.a+=(x.stats?.[ap]||0);acc.s+=(x.stats?.[sf]||0);return acc},{a:0,s:0});
  let yBar=920;
  ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 22px Arial';
  ctx.fillText('MAPA DE POSIÇÕES', 60, yBar);
  yBar+=30;
  POSICOES_DEFS.forEach(p=>{
    const {a,s}=agg(p.ap,p.sf);
    const total=a+s;
    const ratio=total>0?a/total:0;
    const cor = total===0?'rgba(245,239,239,.2)':ratio>=0.65?'#1FC8B4':ratio>=0.45?'#F2B705':'#D72638';
    ctx.fillStyle='#fff'; ctx.font='600 22px Arial';
    ctx.fillText(p.nome, 60, yBar+20);
    const barX=280, barW=W-60-barX;
    ctx.fillStyle='rgba(255,255,255,.08)'; ctx.fillRect(barX,yBar,barW,14);
    ctx.fillStyle=cor; ctx.fillRect(barX,yBar,barW*ratio,14);
    ctx.fillStyle='rgba(245,239,239,.6)'; ctx.font='600 20px Arial';
    ctx.fillText(total>0?Math.round(ratio*100)+'%':'—', barX+barW+14, yBar+13);
    yBar+=54;
  });

  
  ctx.fillStyle='rgba(245,239,239,.3)'; ctx.font='400 18px Arial';
  ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · lifejiu.app`, 60, H-50);

  cv.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`cartao_atleta_${(ud.profile.nome||'atleta').replace(/\s+/g,'_')}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast('Cartão de atleta exportado!');
  },'image/png');
}

function exportTreinoCard(id){
  const ud=getUserData();
  const tr=(ud.treinos||[]).find(x=>x.id===id);
  if(!tr) return;
  const s=tr.stats||{};
  const saldo=s.saldoBJJ ?? calcSaldoBJJ(s);
  const tiposLabel={tecnica:'Técnica',sparring:'Sparring',competicao:'Competição',fisico:'Prep. Física'};
  const dataFmt=new Date(tr.data+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const dur=tr.duracaoMin?formatMin(tr.duracaoMin):(tr.inicio&&tr.fim?tr.inicio+'–'+tr.fim:'');
  const esporteTr=tr.esporte||'jiu-jitsu';
  const spCard=SPORTS_DB[esporteTr]||SPORTS_DB['jiu-jitsu'];
  const cfgCard=STATS_DB[esporteTr]||STATS_DB['jiu-jitsu'];
  const corCard=spCard.cor;
  const labelFinCard=cfgCard.temFinDef===false?'Sessão':(cfgCard.findefTitulo?cfgCard.findefTitulo.split(' & ')[0]:'Finalizações');

  const W=1080,H=1350;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');

  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#1A0D0D'); bg.addColorStop(1,'#0E0A0A');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*0.2,H*0.05,10,W*0.2,H*0.05,W*0.6);
  glow.addColorStop(0,'rgba(255,255,255,.06)'); glow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=hexToRgba(corCard,.4); ctx.lineWidth=3;
  ctx.strokeRect(24,24,W-48,H-48);

  ctx.fillStyle=corCard; ctx.font='800 42px Arial';
  ctx.fillText('LIFE JIU', 60, 108);
  ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 20px Arial';
  ctx.fillText(spCard.nome+' · Registro de Treino', 60, 142);

  ctx.fillStyle='#fff'; ctx.font='800 54px Arial';
  ctx.fillText(tiposLabel[tr.tipo]||tr.tipo, 60, 250);
  ctx.fillStyle='#F2B705'; ctx.font='600 26px Arial';
  ctx.fillText(dataFmt, 60, 290);
  if(ud.profile.nome){
    ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 22px Arial';
    ctx.fillText(ud.profile.nome+(ud.profile.faixa?(spCard.temGraduacao===false?' · '+ud.profile.faixa:' · Faixa '+ud.profile.faixa):''), 60, 326);
  }

  ctx.strokeStyle=hexToRgba(corCard,.2); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(60,370); ctx.lineTo(W-60,370); ctx.stroke();

  const stats=[
    {label:'Duração',value:dur||'—',sub:'tempo de treino',cor:'#fff'},
    {label:'Intensidade',value:`${tr.intensidade}/10`,sub:'esforço percebido',cor:'#F2B705'},
    {label:labelFinCard,value:`${s.finAp||0}`,sub:'aplicadas',cor:'#1FC8B4'},
    {label:'Saldo',value:`${saldo>0?'+':''}${saldo}`,sub:'pontos técnicos',cor:saldo>0?'#1FC8B4':saldo<0?'#D72638':'#fff'},
  ];
  const colW=(W-120)/4;
  stats.forEach((s2,i)=>{
    const x=60+colW*i;
    ctx.fillStyle=s2.cor; ctx.font='800 48px Arial';
    ctx.fillText(s2.value, x, 460);
    ctx.fillStyle='rgba(245,239,239,.45)'; ctx.font='400 18px Arial';
    ctx.fillText(s2.label, x, 492);
    ctx.fillStyle='rgba(245,239,239,.3)'; ctx.font='400 15px Arial';
    ctx.fillText(s2.sub, x, 513);
  });

  ctx.strokeStyle=hexToRgba(corCard,.2); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(60,555); ctx.lineTo(W-60,555); ctx.stroke();

  let y=610;
  const allSubs=[...(tr.subsAp||[]).map(x=>'✓ '+x), ...(tr.subsSf||[]).map(x=>'✗ '+x)];
  if(allSubs.length){
    ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 20px Arial';
    ctx.fillText(labelFinCard.toUpperCase()+' DO DIA', 60, y); y+=42;
    ctx.font='600 26px Arial';
    allSubs.slice(0,8).forEach(txt=>{
      ctx.fillStyle=txt.startsWith('✓')?'#1FC8B4':'#D72638';
      ctx.fillText(txt, 60, y); y+=40;
    });
    y+=20;
  }
  if(tr.parceiro){
    ctx.fillStyle='rgba(245,239,239,.5)'; ctx.font='400 20px Arial';
    ctx.fillText('COM', 60, y); y+=36;
    ctx.fillStyle='#fff'; ctx.font='700 32px Arial';
    ctx.fillText(tr.parceiro, 60, y); y+=40;
  }
  if(tr.obs){
    ctx.fillStyle='rgba(245,239,239,.6)'; ctx.font='italic 400 22px Arial';
    const maxW=W-120;
    const words=tr.obs.split(' '); let line=''; const lines=[];
    words.forEach(w=>{
      const test=line+w+' ';
      if(ctx.measureText(test).width>maxW && line){ lines.push(line); line=w+' '; } else line=test;
    });
    if(line) lines.push(line);
    lines.slice(0,4).forEach(l=>{ ctx.fillText('"'+l.trim()+'"', 60, y); y+=32; });
  }

  ctx.fillStyle='rgba(245,239,239,.3)'; ctx.font='400 18px Arial';
  ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · lifejiu.app`, 60, H-50);

  cv.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`treino_${tr.data}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast('Card do treino exportado!');
  },'image/png');
}


function confirmClearData(){
  if(confirm('Tem certeza? Todos os treinos e dados serão apagados permanentemente.')){
    const ud=defaultUserData();
    ud.profile=getUserData().profile;
    saveUserData(ud); refreshAll(); toast('Dados apagados.','error');
  }
}
document.getElementById('reg-data').value=today();
updateIntColor(5);
initTheme();
checkSession().catch(err => console.error('Erro ao checar sessão:', err));
tentarRegistrarServiceWorker();



(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia && window.matchMedia('(hover:none)').matches;
  if(reduce || isTouch) return;
  var raf = null, tx = 0, ty = 0;
  function apply(){
    document.documentElement.style.setProperty('--px', tx.toFixed(2));
    document.documentElement.style.setProperty('--py', ty.toFixed(2));
    raf = null;
  }
  window.addEventListener('mousemove', function(e){
    tx = (e.clientX / window.innerWidth - .5) * 10;
    ty = (e.clientY / window.innerHeight - .5) * 10;
    if(!raf) raf = requestAnimationFrame(apply);
  }, {passive:true});
})();
