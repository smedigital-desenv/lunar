// =====================================================================
// supabaseClient.js
// Cliente Supabase compartilhado. TODA chamada ao banco passa por aqui
// (páginas nunca chamam o Supabase diretamente — regra do CLAUDE.md).
//
// Autenticação NÃO é configurada aqui por ora (login/guarda de rota virão
// depois). Em runtime, sem sessão o RLS não retorna linhas e as funções
// exigem auth.uid() — isto é esperado até a etapa de autenticação.
//
// Usa apenas a anon key. A service_role key jamais entra no front-end.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// db.schema = 'gestao' faz `from()` e `rpc()` apontarem ao nosso schema.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'gestao' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Executa uma função de negócio (RPC) e padroniza o erro.
// As funções do banco levantam mensagens claras em português — repassamos.
export async function rpc(nome, params = {}) {
  const { data, error } = await supabase.rpc(nome, params);
  if (error) throw traduzErro(error, nome);
  return data;
}

// Normaliza erros do Supabase/PostgREST num Error com contexto.
export function traduzErro(error, contexto) {
  const mensagem = error?.message || 'Erro inesperado ao acessar o servidor.';
  const e = new Error(mensagem);
  e.contexto = contexto;
  e.codigo = error?.code ?? null;
  e.original = error;
  return e;
}
