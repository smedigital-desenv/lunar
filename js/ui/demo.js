// =====================================================================
// demo.js — modo demonstração, explícito e reversível.
//
// Antes, QUALQUER falha na consulta real virava "modo demonstração": o
// sistema mostrava dados falsos no lugar do erro. Foi assim que uma
// migração faltando (fn_caixa_saida) passou despercebida — a tela dizia
// "demonstração" em vez de "função não encontrada no banco".
//
// Agora a regra é:
//   · demonstração LIGADA           -> dados de exemplo, sempre;
//   · sem sessão (offline/sem config) -> dados de exemplo, como antes;
//   · com sessão e erro             -> o erro sobe e a tela o mostra.
//
// O estado vive em sessionStorage: atravessa as telas da mesma aba e se
// apaga quando ela fecha — ninguém esquece a demonstração ligada.
// =====================================================================

import { aguardarSessao } from '../services/supabaseClient.js';

const CHAVE = 'LUNAR_DEMO';

export function ligado() {
  try { return sessionStorage.getItem(CHAVE) === '1'; } catch (_) { return false; }
}

function definir(valor) {
  try {
    if (valor) sessionStorage.setItem(CHAVE, '1');
    else sessionStorage.removeItem(CHAVE);
  } catch (_) { /* navegador sem storage: a demonstração só não persiste */ }
}

// Há alguém logado? Usa a guarda já memorizada — não abre sessão nova.
export async function temSessao() {
  try { return !!await aguardarSessao(); } catch (_) { return false; }
}

// Envelopa o carregamento de uma tela. `real` busca do banco; `exemplo`
// devolve a massa de demonstração. Devolve sempre { itens, total, demo }
// ou o que `real`/`exemplo` devolverem, com `demo` marcado.
export async function carregar(real, exemplo) {
  if (ligado()) return { ...await exemplo(), demo: true };
  try {
    return { ...await real(), demo: false };
  } catch (e) {
    // Sem sessão, cair no exemplo é o comportamento desejado (tela
    // abrível offline). Com sessão, esconder o erro seria mentir.
    if (await temSessao()) throw e;
    return { ...await exemplo(), demo: true };
  }
}

// Botão discreto no cabeçalho, só para quem administra o sistema.
// Fica ao lado dos demais links; não some da tela, para que ninguém
// fique preso na demonstração sem saber como sair.
export function montarBotao(el, usuario) {
  if (!el || !usuario?.pode_administrar) return;
  if (el.querySelector('.sessao__demo')) return;

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'sessao__demo';
  const pintar = () => {
    const on = ligado();
    botao.textContent = on ? 'Demonstração: ligada' : 'Demonstração';
    botao.classList.toggle('sessao__demo--on', on);
    botao.title = on
      ? 'Exibindo dados de exemplo. Clique para voltar aos dados reais.'
      : 'Exibir dados de exemplo, sem tocar no banco.';
    botao.setAttribute('aria-pressed', String(on));
  };
  pintar();

  botao.addEventListener('click', () => {
    definir(!ligado());
    pintar();
    location.reload();          // as telas carregam os dados na abertura
  });

  // O botão Sair não é mais sempre filho direto de `el` (mora dentro do
  // painel de sessão no celular) — insere no pai real, seja ele qual for.
  const sair = el.querySelector('.sessao__sair');
  (sair ? sair.parentNode : el).insertBefore(botao, sair ?? null);
}
