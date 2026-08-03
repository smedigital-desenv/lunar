// =====================================================================
// ajuda.js — tela "Como usar o sistema". A página é conteúdo estático;
// aqui só montamos os elementos comuns (sessão, sino e navegação).
// =====================================================================

import { montarSino } from './notificacoes.js';
import { iniciarSessao } from './sessao.js';
import { montarNavegacao } from './navegacao.js';

montarSino('sino-notificacoes');
iniciarSessao();
montarNavegacao();   // sem aba ativa: a ajuda não é um dos destinos da barra
