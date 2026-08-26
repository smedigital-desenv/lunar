// =====================================================================
// login.js — controla a tela de login (Sessão 3).
// Liga os botões (Google / e-mail-senha) às funções de js/auth.js. O
// acesso ao Supabase é carregado de forma preguiçosa: se o supabase-js não
// carregar, ou não houver config, mostra o aviso de modo demonstração.
//
// ⚠️ FORA DE USO desde a Fase 4: `pages/login.html` virou redirecionamento
// para /central/login.html e não carrega mais este módulo. Mantido porque é
// a única interface de login própria que existe — se um dia o sistema
// precisar rodar destacado do central, é daqui que se recomeça.
// =====================================================================

const alerta = document.getElementById('alerta');
const avisoDemo = document.getElementById('aviso-demo');

function mostrarErro(msg) { alerta.textContent = msg; alerta.hidden = false; }
function limparErro() { alerta.hidden = true; }

function modoDemo() {
  avisoDemo.hidden = false;
  document.getElementById('btn-google').disabled = true;
  document.getElementById('btn-senha').disabled = true;
}

function irParaInicio() { location.href = './meus-processos.html'; }

async function iniciar() {
  const erroUrl = new URLSearchParams(location.search).get('erro');
  if (erroUrl) mostrarErro(erroUrl);

  let auth;
  try {
    auth = await import('../auth.js');
  } catch (_) {
    modoDemo();
    return;
  }
  if (!auth.estaConfigurado()) { modoDemo(); return; }

  // Já autenticado? Vai direto para Meus processos — MAS não quando
  // chegamos aqui por erro da guarda de rota (?erro=): senão a guarda manda
  // ao login e o login manda de volta, em loop infinito. Nesse caso ficamos
  // no login exibindo o erro (ex.: schema não exposto, usuário não provisionado).
  if (!erroUrl && await auth.sessaoAtual()) { irParaInicio(); return; }

  document.getElementById('btn-google').addEventListener('click', async () => {
    limparErro();
    try { await auth.loginGoogle(); }               // redireciona para o Google
    catch (e) { mostrarErro(e.message || 'Falha ao iniciar o login com Google.'); }
  });

  document.getElementById('form-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErro();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const btn = document.getElementById('btn-senha');
    btn.disabled = true;
    try {
      await auth.loginSenha(email, senha);
      irParaInicio();
    } catch (err) {
      mostrarErro(err.message || 'E-mail ou senha inválidos.');
      btn.disabled = false;
    }
  });
}

iniciar().catch((e) => mostrarErro(e.message || 'Erro ao carregar a tela de login.'));
