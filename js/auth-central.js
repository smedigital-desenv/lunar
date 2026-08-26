// =====================================================================
// auth-central.js — ponte para o Controle de Acesso CENTRAL da rede SME.
//
// O login e a liberação de TELAS passam a ser governados pelo central
// (window.AcessoSME, servido em /central/). Não há mais login próprio: sem
// sessão no central, a pessoa é levada para /central/login.html.
//
// Os DADOS continuam neste projeto Supabase. A autorização REAL continua
// sendo a RLS sobre gestao.usuarios (regra 4 do CLAUDE.md): o central diz
// quais telas aparecem, o banco diz quais linhas a pessoa vê.
//
// Diferente do MAPA, aqui não é preciso interceptar window.fetch: toda
// chamada ao banco já passa por js/services/supabaseClient.js.
// =====================================================================

import { supabase } from './services/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { usuarioCorrente, estaConfigurado } from './auth.js';

const SISTEMA = 'lunar';
const LOGIN_CENTRAL = '/central/login.html';
const BASE_CENTRAL = '/central/';
// O acesso-sme.js espera o supabase-js como GLOBAL (window.supabase). O
// cliente deste sistema vem do esm.sh como ES module — são cópias
// independentes da biblioteca, e é assim mesmo.
const CDN_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

// Carrega um script clássico (o central não é ES module).
function carregarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

// O central injeta um "chip" de usuário fixo no canto inferior direito. No
// lunar isso cobriria a navegação de rodapé do mobile, e o usuário já
// aparece no cabeçalho — então escondemos.
function esconderChipCentral() {
  if (document.getElementById('estilo-central-lunar')) return;
  const st = document.createElement('style');
  st.id = 'estilo-central-lunar';
  st.textContent = '#acesso-user-chip{display:none !important}';
  document.head.appendChild(st);
}

// Tela de bloqueio própria, no visual do sistema. Usada quando o central
// autorizou mas o banco do lunar ainda não conhece a pessoa.
function telaBloqueio(titulo, mensagem) {
  document.body.innerHTML =
    '<main class="pagina"><div class="aviso-bloqueio">'
    + `<h1>${titulo}</h1><p>${mensagem}</p>`
    + '<p><a href="' + LOGIN_CENTRAL + '">Voltar ao login da rede</a></p>'
    + '</div></main>';
}

// O `window.AcessoSME` não existe quando o acesso-sme.js termina de carregar:
// ele é criado dentro de `montar()`, que só roda depois de o supabase-js
// chegar do CDN (`carregarSupabaseJs().then(montar)`, no fim daquele arquivo).
// Conferir logo após o `onload` acusaria "não carregou" sempre. Por isso
// esperamos o objeto aparecer, em vez de testar uma vez só.
function esperarAcessoSME(limiteMs = 15000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    (function tentar() {
      if (window.AcessoSME?.pronto) return resolve(window.AcessoSME.pronto);
      if (Date.now() - inicio > limiteMs) {
        return reject(new Error('O módulo de acesso central não inicializou a tempo.'));
      }
      setTimeout(tentar, 50);
    })();
  });
}

// Carrega o módulo do central uma única vez por página.
let modulosCentral = null;
function carregarCentral() {
  if (modulosCentral) return modulosCentral;
  // Precisa vir ANTES do acesso-sme.js: é assim que ele sabe qual sistema
  // conferir e para onde mandar quem não tem sessão.
  window.ACESSO_SISTEMA = SISTEMA;
  window.ACESSO_LOGIN = LOGIN_CENTRAL;
  modulosCentral = (async () => {
    // O supabase-js vem primeiro de propósito: o acesso-sme.js o buscaria
    // sozinho, mas carregá-lo aqui encurta a espera do passo seguinte.
    await carregarScript(CDN_SUPABASE);
    await carregarScript(`${BASE_CENTRAL}config.js`);
    await carregarScript(`${BASE_CENTRAL}acesso-sme.js`);
    return await esperarAcessoSME();
  })();
  return modulosCentral;
}

// Troca o token do central por uma sessão DESTE projeto.
// Sem isso as consultas sairiam como `anon`, que não tem permissão nenhuma.
async function pedirTokenAPonte(tokenCentral) {
  const resposta = await fetch(`${SUPABASE_URL}/functions/v1/central-bridge`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${tokenCentral}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados?.token_hash) {
    const e = new Error(dados?.erro || `HTTP ${resposta.status}`);
    e.erro = dados?.erro || null;
    throw e;
  }
  return dados;
}

// O e-mail com que a pessoa entra na rede nem sempre é o da conta local: a
// ponte traduz um no outro quando o endereço de login pertence a outra conta
// deste projeto compartilhado (ver o bloco 4a da central-bridge). A tradução
// só é conhecida DEPOIS de chamar a ponte, mas a comparação abaixo acontece
// ANTES — por isso guardamos o que ela respondeu.
//
// Sem esta memória, quem tem os dois endereços diferentes cairia no ramo
// "trocou de conta" a cada carregamento e gastaria um magic link por página.
// Sem localStorage a pessoa perde só o atalho, não o acesso.
const CHAVE_CONTA = 'ACESSO_CONTA_v1';

function contaConhecida(emailLogin) {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONTA) || '{}')[emailLogin] || null;
  } catch (_) {
    return null;
  }
}

function lembrarConta(emailLogin, emailConta) {
  if (!emailLogin || !emailConta) return;
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_CONTA) || '{}');
    if (mapa[emailLogin] === emailConta) return;
    mapa[emailLogin] = emailConta;
    localStorage.setItem(CHAVE_CONTA, JSON.stringify(mapa));
  } catch (_) { /* sem localStorage: só perde o atalho */ }
}

// Garante sessão local para quem está logado no central.
async function garantirSessaoLocal(api) {
  // Tem que ser o e-mail REAL, não o simulado: durante a simulação o
  // AcessoSME.perfil vira o perfil observado, mas o token continua sendo o de
  // quem simula — e é o token que a ponte valida. Usar o e-mail simulado aqui
  // faria a comparação nunca bater, derrubando a sessão a cada carregamento.
  const emailReal = String(api.realPerfil?.email || api.perfil?.email || '').toLowerCase();
  const emailEsperado = contaConhecida(emailReal) || emailReal;

  const { data: { session } } = await supabase.auth.getSession();
  if (session && String(session.user.email || '').toLowerCase() === emailEsperado) return true;

  // Trocou de conta no central: encerra só esta aba, sem invalidar os refresh
  // tokens da pessoa em outros dispositivos.
  if (session) await supabase.auth.signOut({ scope: 'local' });

  const tokenCentral = await window.AcessoSME.token();
  if (!tokenCentral) throw new Error('Sua sessão no central expirou. Faça login novamente.');

  let ponte = await pedirTokenAPonte(tokenCentral);

  // O tipo tem que ser o mesmo com que o token foi gerado; a ponte informa
  // qual é. A lista de reserva cobre variação entre versões do Supabase.
  const tipos = [];
  if (ponte.tipo) tipos.push(ponte.tipo);
  for (const t of ['magiclink', 'email']) if (!tipos.includes(t)) tipos.push(t);

  // Uma tentativa por token: o verify CONSOME o hash, então repetir com outro
  // tipo sobre o mesmo token sempre falharia. Se o tipo informado não servir,
  // pedimos um token novo antes de tentar o próximo.
  let ultimoErro = null;
  for (let i = 0; i < tipos.length; i++) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: ponte.token_hash, type: tipos[i]
    });
    if (!error) {
      // A ponte só informa `email_conta` quando ela mesma traduziu; nas
      // versões anteriores o campo não vem, e aí não há o que lembrar.
      lembrarConta(emailReal, String(ponte.email_conta || '').toLowerCase());
      return true;
    }
    ultimoErro = error;
    if (i + 1 < tipos.length) ponte = await pedirTokenAPonte(tokenCentral);
  }
  throw new Error(`Não foi possível abrir sua sessão: ${ultimoErro?.message || 'erro desconhecido'}`);
}

// Mensagens legíveis para os erros que a ponte devolve.
const MENSAGENS_PONTE = {
  fora_do_dominio: 'Sua conta não pertence ao domínio @educacao.pmrp.sp.gov.br. '
    + 'O acesso a este sistema é restrito a contas institucionais.',
  sem_acesso_ao_lunar: 'Sua conta não tem acesso ao sistema de Demandas. '
    + 'Solicite a liberação à administração da rede.',
  nao_autorizado: 'Sua conta ainda não foi autorizada no controle de acesso da rede.'
};

// ---------------------------------------------------------------- Guarda
// Protege uma página. Em modo demo (sem config), NÃO redireciona — a página
// segue com dados de exemplo, como antes.
// Retorna o usuário corrente (perfil + unidade), ou null.
//
// Memorizado por página: `admin.js` e `equipes.js` chamam a guarda por conta
// própria, além do `sessao.js`. Sem isso duas chamadas simultâneas pediriam
// dois magic links, e o verifyOtp de uma consumiria o hash da outra.
let guardaEmCurso = null;
export function protegerRotaCentral() {
  if (!guardaEmCurso) guardaEmCurso = executarGuarda();
  return guardaEmCurso;
}

async function executarGuarda() {
  if (!estaConfigurado()) return null;

  let api;
  try {
    api = await carregarCentral();
  } catch (e) {
    console.error('[auth-central]', e);
    telaBloqueio('Acesso indisponível',
      'Não foi possível carregar o controle de acesso da rede. Recarregue a página.');
    return null;
  }

  // Sem perfil = o central já redirecionou ao login ou já pintou "sem acesso".
  if (!api || !window.AcessoSME?.perfil) return null;

  esconderChipCentral();

  try {
    await garantirSessaoLocal(window.AcessoSME);
  } catch (e) {
    console.error('[auth-central] ponte recusou:', e);
    telaBloqueio('Acesso negado', MENSAGENS_PONTE[e.erro] || e.message);
    return null;
  }

  // A partir daqui auth.uid() funciona e a RLS volta a valer normalmente.
  try {
    return await usuarioCorrente();
  } catch (e) {
    telaBloqueio('Cadastro pendente',
      'Seu acesso à rede foi reconhecido, mas você ainda não está cadastrado '
      + 'no sistema de Demandas. Um administrador precisa definir seu perfil '
      + 'e sua unidade antes do primeiro uso.');
    return null;
  }
}

// Sair encerra as DUAS sessões: a deste projeto e a do central. Sem isso a
// sessão local sobreviveria ao logout e a próxima pessoa no mesmo navegador
// entraria com a conta anterior.
export async function logoutCentral() {
  try { await supabase.auth.signOut(); } catch (_) { /* segue para o central */ }
  if (window.AcessoSME?.signOut) return window.AcessoSME.signOut();
  location.href = LOGIN_CENTRAL;
}
