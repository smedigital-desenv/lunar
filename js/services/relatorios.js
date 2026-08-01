// =====================================================================
// relatorios.js — emissão e validação de relatórios do processo (Solar).
//
// A geração do PDF é feita pela Edge Function `relatorios` (Deno), que
// grava a emissão em relatorios_emitidos + movimentação na mesma transação.
// Aqui só invocamos a função e devolvemos o resultado; nenhuma regra de
// negócio no front (regra do CLAUDE.md).
// =====================================================================

import { supabase } from './supabaseClient.js';
import { SUPABASE_URL } from '../config.js';

// Emite um relatório. tipo: 'resumo' | 'inteiro_teor'.
// Retorna { id, codigo, hash, caminho, pdf_base64 }.
export async function emitirRelatorio(demandaId, tipo, anonimizado = false) {
  const { data, error } = await supabase.functions.invoke('relatorios', {
    body: { demanda_id: demandaId, tipo, anonimizado }
  });
  if (error) throw error;
  if (data?.erro) throw new Error(data.erro);
  return data;
}

// URL pública de validação (rota GET da Edge Function).
export function urlValidacao(codigo) {
  return `${SUPABASE_URL}/functions/v1/relatorios?codigo=${encodeURIComponent(codigo)}`;
}

// Converte o pdf_base64 devolvido pela função num Blob para download/preview.
export function pdfBlob(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

// Dispara o download do PDF no navegador.
export function baixarPdf(base64, nomeArquivo) {
  const url = URL.createObjectURL(pdfBlob(base64));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo || 'relatorio.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
