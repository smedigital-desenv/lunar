// =====================================================================
// componentes.js — helpers de UI reutilizáveis (sem framework).
// Usados por todas as telas. NADA de innerHTML com dado do banco sem
// passar por escapeHtml() antes.
// =====================================================================

const FUSO = 'America/Sao_Paulo';

// ---------------------------------------------------------------- Escape
export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------------------------------------------------------------- Datas (SP)
export function fmtDataHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR',
    { dateStyle: 'short', timeStyle: 'short', timeZone: FUSO }).format(new Date(iso));
}
export function fmtData(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR',
    { dateStyle: 'short', timeZone: FUSO }).format(new Date(iso));
}
// Prazo é DATE (YYYY-MM-DD): formata sem conversão de fuso para não "voltar" um dia.
export function fmtPrazo(data) {
  if (!data) return '—';
  const [a, m, d] = String(data).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------- Rótulos
const ROTULO_SITUACAO = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_complementacao: 'Aguardando complementação',
  devolvida: 'Devolvida',
  concluida: 'Concluída',
  reaberta: 'Reaberta',
  inativa: 'Inativa'
};
const ROTULO_PRIORIDADE = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente'
};
const TIPO_MOV = {
  criacao:                    { rotulo: 'Criação', icone: '✚' },
  encaminhamento:             { rotulo: 'Encaminhamento', icone: '→' },
  subtarefa:                  { rotulo: 'Subtarefa criada', icone: '↳' },
  devolutiva:                 { rotulo: 'Devolutiva', icone: '↩' },
  despacho:                   { rotulo: 'Despacho', icone: '✎' },
  comentario:                 { rotulo: 'Comentário', icone: '❝' },
  alteracao_situacao:         { rotulo: 'Mudança de situação', icone: '⇄' },
  solicitacao_complementacao: { rotulo: 'Solicitação de complementação', icone: '?' },
  conclusao:                  { rotulo: 'Conclusão', icone: '✓' },
  reabertura:                 { rotulo: 'Reabertura', icone: '↺' },
  edicao:                     { rotulo: 'Edição', icone: '✎' },
  retificacao:                { rotulo: 'Retificação', icone: '✎' },
  ressalva:                   { rotulo: 'Ressalva', icone: '!' },
  inativacao:                 { rotulo: 'Inativação', icone: '⊘' },
  reativacao:                 { rotulo: 'Reativação', icone: '⟳' },
  emissao_relatorio:          { rotulo: 'Emissão de relatório', icone: '▤' }
};
export const rotuloSituacao = (s) => ROTULO_SITUACAO[s] ?? s ?? '—';
export const rotuloPrioridade = (p) => ROTULO_PRIORIDADE[p] ?? p ?? '—';
export const rotuloTipo = (t) => (TIPO_MOV[t]?.rotulo) ?? t ?? '—';
export const iconeTipo = (t) => (TIPO_MOV[t]?.icone) ?? '•';

// ---------------------------------------------------------------- Badges
export function badgeSituacao(situacao) {
  return `<span class="badge-chip badge-situacao badge-situacao--${escapeHtml(situacao)}">`
       + `${escapeHtml(rotuloSituacao(situacao))}</span>`;
}
export function badgePrioridade(prioridade) {
  return `<span class="badge-chip badge-prioridade badge-prioridade--${escapeHtml(prioridade)}">`
       + `${escapeHtml(rotuloPrioridade(prioridade))}</span>`;
}
export function badgeSigilo(sigilo) {
  if (sigilo !== 'restrito') return '';
  return `<span class="badge-chip badge-sigilo">Sigilo restrito</span>`;
}

// ---------------------------------------------------------------- Avatar
export function iniciais(nome) {
  const partes = String(nome || '?').trim().split(/\s+/);
  const a = partes[0]?.[0] ?? '?';
  const b = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (a + b).toUpperCase();
}

// ---------------------------------------------------------------- Timeline
// mov: { tipo, texto, criado_em, autor_nome, destinatario_nome, situacao_nova }
// opts: { retificadoPor: {autor_nome, texto}, ressalva: {autor_nome, texto} }
export function itemTimeline(mov, opts = {}) {
  const retificado = !!opts.retificadoPor;
  const partes = [];
  partes.push(`<li class="timeline__item${retificado ? ' timeline__item--retificado' : ''}">`);
  partes.push(`<span class="timeline__marcador" title="${escapeHtml(rotuloTipo(mov.tipo))}">${iconeTipo(mov.tipo)}</span>`);
  partes.push('<div class="timeline__cabecalho">');
  partes.push(`<span class="timeline__autor">${escapeHtml(mov.autor_nome || '—')}</span>`);
  partes.push(`<span class="texto-silencioso">${escapeHtml(rotuloTipo(mov.tipo))}</span>`);
  if (mov.destinatario_nome) {
    partes.push(`<span class="texto-silencioso">→ ${escapeHtml(mov.destinatario_nome)}</span>`);
  }
  partes.push(`<span class="timeline__data">${escapeHtml(fmtDataHora(mov.criado_em))}</span>`);
  partes.push('</div>');
  if (mov.texto) partes.push(`<p class="timeline__texto">${escapeHtml(mov.texto)}</p>`);
  if (retificado) {
    partes.push(`<p class="timeline__aviso">Registro retificado por `
      + `${escapeHtml(opts.retificadoPor.autor_nome)} — texto correto: `
      + `${escapeHtml(opts.retificadoPor.texto)}</p>`);
  }
  if (opts.ressalva) {
    partes.push(`<p class="timeline__aviso">Ressalva de `
      + `${escapeHtml(opts.ressalva.autor_nome)}: ${escapeHtml(opts.ressalva.texto)}</p>`);
  }
  partes.push('</li>');
  return partes.join('');
}

// ---------------------------------------------------------------- Toast
export function toast(mensagem, tipo = 'info') {
  const cores = { info: '#14539a', sucesso: '#198754', erro: '#dc3545', aviso: '#d97706' };
  const div = document.createElement('div');
  div.textContent = mensagem;
  Object.assign(div.style, {
    position: 'fixed', left: '50%', bottom: '1.2rem', transform: 'translateX(-50%)',
    background: cores[tipo] || cores.info, color: '#fff', padding: '.6rem 1rem',
    borderRadius: '8px', boxShadow: '0 6px 24px rgba(0,0,0,.2)', zIndex: 2000,
    fontSize: '.9rem', maxWidth: '90%', textAlign: 'center', opacity: '0',
    transition: 'opacity .2s'
  });
  document.body.appendChild(div);
  requestAnimationFrame(() => { div.style.opacity = '1'; });
  setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 250);
  }, 3200);
}
