// =====================================================================
// anexos.js — upload ao Supabase Storage + hash + validação.
// O REGISTRO do anexo no banco acontece dentro da função de devolutiva
// (fn_registrar_devolutiva recebe os metadados). Aqui só subimos o arquivo
// e devolvemos os metadados prontos para passar adiante.
//
// Nome no storage é normalizado (sem acento/espaço); o nome original é
// preservado no banco (seção 13).
// =====================================================================

import { supabase, aguardarSessao } from './supabaseClient.js';
import { CONFIG } from '../config.js';

// Remove acentos e caracteres problemáticos para uso como nome de arquivo.
// \p{Diacritic} remove as marcas diacríticas combinantes após NFD.
export function normalizarNome(nome) {
  return (nome || 'arquivo')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// SHA-256 do arquivo (hex), via Web Crypto — sem dependência externa.
export async function calcularHashSHA256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Valida tamanho e tipo MIME conforme CONFIG (20 MB; PDF/Word/Excel/imagens).
export function validarArquivo(file) {
  const maxBytes = CONFIG.tamanhoMaximoAnexoMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Arquivo excede ${CONFIG.tamanhoMaximoAnexoMB} MB.`);
  }
  if (!CONFIG.tiposAnexoPermitidos.includes(file.type)) {
    throw new Error('Tipo de arquivo não permitido (aceitos: PDF, Word, Excel, JPG, PNG).');
  }
}

// Sobe o arquivo e devolve os metadados no formato esperado pelas funções
// do banco. `pasta` organiza o storage (ex.: `demanda/<id>`).
export async function subirAnexo(file, { pasta = 'demandas' } = {}) {
  await aguardarSessao();
  validarArquivo(file);
  const hash = await calcularHashSHA256(file);
  const nomeStorage = `${pasta}/${Date.now()}_${normalizarNome(file.name)}`;

  const { error } = await supabase.storage
    .from(CONFIG.bucketAnexos)
    .upload(nomeStorage, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  return {
    nome_original: file.name,
    nome_storage: nomeStorage,
    mime: file.type,
    tamanho_bytes: file.size,
    hash_sha256: hash,
    storage_path: nomeStorage
  };
}

// URL assinada temporária para baixar/visualizar um anexo do storage.
export async function urlAssinada(storagePath, segundos = 300) {
  await aguardarSessao();
  const { data, error } = await supabase.storage
    .from(CONFIG.bucketAnexos).createSignedUrl(storagePath, segundos);
  if (error) throw error;
  return data.signedUrl;
}
