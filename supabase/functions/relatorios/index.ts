// =====================================================================
// relatorios — Edge Function (Deno) — Sessão 10 (seção 14).
// Sistema de Gestão de Demandas — SME Ribeirão Preto.
//
// POST  { demanda_id, tipo: 'resumo'|'inteiro_teor', anonimizado? }
//       Gera o PDF (A4, "Página X de Y"), calcula hash + código, sobe ao
//       storage e grava a emissão (relatorios_emitidos + movimentação) via
//       fn_emitir_relatorio. Devolve { id, codigo, hash, caminho, pdf_base64 }.
//
// GET   ?codigo=...   Rota pública de validação (fn_validar_relatorio).
//
// Segredos vêm do ambiente do Supabase (SUPABASE_URL / ANON / SERVICE_ROLE);
// a service_role NUNCA é versionada nem exposta ao front.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "relatorios";
const FUSO = "America/Sao_Paulo";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ------------------------------------------------------------ Utilidades
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Base64 seguro para binários grandes (evita estourar a pilha do spread).
function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    bin += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(bin);
}

// As fontes padrão do pdf-lib (Helvetica) usam codificação WinAnsi, que NÃO
// cobre todo o Unicode: desenhar um caractere de fora (uma seta "→", um
// emoji digitado num comentário, aspas curvas de um "copiar e colar" do
// Word) faz a pdf-lib lançar exceção e derruba a emissão inteira.
// Aqui trocamos o que dá para traduzir e substituímos o resto por "?".
const EQUIVALENTES: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "≤": "<=", "≥": ">=",
  "✔": "OK", "✓": "OK", "✘": "X", "✗": "X", "≠": "!=",
};
// Caracteres acima de 0xFF que a WinAnsi ainda representa (faixa 0x80–0x9F).
const EXTRAS_WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function sanitizar(texto: string): string {
  let s = String(texto ?? "");
  for (const [de, para] of Object.entries(EQUIVALENTES)) s = s.replaceAll(de, para);
  return Array.from(s)
    .map((c) => (c.codePointAt(0)! <= 0xff || EXTRAS_WINANSI.includes(c) ? c : "?"))
    .join("");
}

function gerarCodigo(): string {
  const n = new Uint8Array(6);
  crypto.getRandomValues(n);
  const hex = Array.from(n).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: FUSO }).format(new Date(iso));
}
function fmtData(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: FUSO }).format(new Date(iso));
}
function fmtBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
const ROTULO_TIPO: Record<string, string> = {
  criacao: "Criação", encaminhamento: "Encaminhamento", subtarefa: "Subtarefa",
  devolutiva: "Devolutiva", despacho: "Despacho", comentario: "Comentário",
  alteracao_situacao: "Mudança de situação", solicitacao_complementacao: "Solicitação de complementação",
  conclusao: "Conclusão", reabertura: "Reabertura", edicao: "Edição", retificacao: "Retificação",
  ressalva: "Ressalva", inativacao: "Inativação", reativacao: "Reativação", emissao_relatorio: "Emissão de relatório",
};

// ------------------------------------------------------------ Layout PDF
const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 56; // ~2 cm
const LARGURA = A4.w - MARGEM * 2;

class Documento {
  doc!: PDFDocument;
  fonte!: any;
  fonteBold!: any;
  pagina!: any;
  y = 0;

  async iniciar() {
    this.doc = await PDFDocument.create();
    this.fonte = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fonteBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.novaPagina();
  }
  novaPagina() {
    this.pagina = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - MARGEM;
  }
  garantir(altura: number) {
    if (this.y - altura < MARGEM + 30) this.novaPagina();
  }
  // Quebra o texto em linhas que cabem na largura dada.
  private quebrar(texto: string, fonte: any, tam: number, largura: number): string[] {
    const linhas: string[] = [];
    for (const bruto of sanitizar(texto).split("\n")) {
      let atual = "";
      for (const palavra of bruto.split(/\s+/)) {
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(teste, tam) > largura && atual) {
          linhas.push(atual);
          atual = palavra;
        } else {
          atual = teste;
        }
      }
      linhas.push(atual);
    }
    return linhas;
  }
  texto(txt: string, opts: { tam?: number; bold?: boolean; cor?: any; recuo?: number; espaco?: number } = {}) {
    const tam = opts.tam ?? 10;
    const fonte = opts.bold ? this.fonteBold : this.fonte;
    const x = MARGEM + (opts.recuo ?? 0);
    const largura = LARGURA - (opts.recuo ?? 0);
    for (const linha of this.quebrar(txt, fonte, tam, largura)) {
      this.garantir(tam + 4);
      this.pagina.drawText(linha, { x, y: this.y - tam, size: tam, font: fonte, color: opts.cor ?? rgb(0.1, 0.12, 0.15) });
      this.y -= tam + 3;
    }
    this.y -= opts.espaco ?? 0;
  }
  rotuloValor(rotulo: string, valor: string) {
    this.texto(`${rotulo}: ${valor || "—"}`, { tam: 10 });
  }
  titulo(txt: string) {
    this.garantir(24);
    this.y -= 6;
    this.texto(txt, { tam: 12, bold: true, cor: rgb(0.08, 0.33, 0.60) });
    this.garantir(2);
    this.pagina.drawLine({
      start: { x: MARGEM, y: this.y + 2 }, end: { x: MARGEM + LARGURA, y: this.y + 2 },
      thickness: 0.5, color: rgb(0.8, 0.85, 0.9),
    });
    this.y -= 6;
  }
  linhaFina() { this.y -= 4; }
}

function cabecalho(d: Documento, subtitulo: string, anon: boolean) {
  d.texto("PREFEITURA MUNICIPAL DE RIBEIRÃO PRETO", { tam: 11, bold: true, cor: rgb(0.08, 0.33, 0.60) });
  d.texto("Secretaria Municipal de Educação — Sistema de Gestão de Demandas", { tam: 9, cor: rgb(0.35, 0.4, 0.45) });
  d.texto(subtitulo, { tam: 13, bold: true, espaco: 2 });
  if (anon) d.texto("VERSÃO ANONIMIZADA — nomes de aluno e responsáveis omitidos (sigilo restrito).", { tam: 9, bold: true, cor: rgb(0.6, 0.1, 0.1), espaco: 4 });
}

function rodape(d: Documento, codigo: string, hash: string, urlValidacao: string) {
  const paginas = d.doc.getPages();
  const total = paginas.length;
  paginas.forEach((p, i) => {
    const y = MARGEM - 18;
    p.drawLine({ start: { x: MARGEM, y: y + 22 }, end: { x: MARGEM + LARGURA, y: y + 22 }, thickness: 0.5, color: rgb(0.8, 0.85, 0.9) });
    const linha1 = sanitizar(`Código de verificação: ${codigo}  ·  Hash SHA-256: ${hash.slice(0, 32)}…`);
    const linha2 = sanitizar(`Valide em: ${urlValidacao}?codigo=${codigo}`);
    p.drawText(linha1, { x: MARGEM, y: y + 12, size: 7, font: d.fonte, color: rgb(0.35, 0.4, 0.45) });
    p.drawText(linha2, { x: MARGEM, y: y + 3, size: 7, font: d.fonte, color: rgb(0.35, 0.4, 0.45) });
    const pag = `Página ${i + 1} de ${total}`;
    const larguraPag = d.fonte.widthOfTextAtSize(pag, 7);
    p.drawText(pag, { x: MARGEM + LARGURA - larguraPag, y: y + 3, size: 7, font: d.fonte, color: rgb(0.35, 0.4, 0.45) });
  });
}

// ------------------------------------------------------------ Conteúdo
function corpoResumo(d: Documento, dados: any) {
  const dem = dados.demanda;
  cabecalho(d, `Relatório-resumo — ${dem.numero}`, dados.anonimizado);
  d.titulo("Identificação");
  d.rotuloValor("Título", dem.titulo);
  d.rotuloValor("Tipo", dem.tipo);
  d.rotuloValor("Unidade responsável", `${dem.unidade_responsavel ?? "—"}${dem.unidade_sigla ? ` (${dem.unidade_sigla})` : ""}`);
  d.rotuloValor("Escola", dem.escola);
  d.rotuloValor("Processo Solar", dem.numero_processo_solar);
  if (!dados.anonimizado) d.rotuloValor("Aluno", dem.aluno_nome);
  d.titulo("Datas");
  d.rotuloValor("Abertura", fmtDataHora(dem.criado_em));
  d.rotuloValor("Prazo", fmtData(dem.prazo));
  d.rotuloValor("Conclusão", fmtDataHora(dem.data_conclusao));
  d.titulo("Responsáveis");
  d.rotuloValor("Solicitante", dem.solicitante);
  d.rotuloValor("Quem atendeu", dem.responsavel_atual);
  d.titulo("Objeto / queixa");
  d.texto(dem.objeto_queixa || "—", { tam: 10, espaco: 2 });
  if (dados.pessoas?.length) {
    d.titulo("Pessoas envolvidas");
    for (const p of dados.pessoas) d.texto(`• ${p.nome} — ${p.vinculo}${p.observacao ? ` (${p.observacao})` : ""}`, { tam: 10 });
  }
  const enc = (dados.movimentacoes || []).filter((m: any) => ["encaminhamento", "subtarefa", "devolutiva"].includes(m.tipo));
  if (enc.length) {
    d.titulo("Encaminhamentos realizados");
    for (const m of enc) {
      d.texto(`${fmtDataHora(m.criado_em)} — ${ROTULO_TIPO[m.tipo] ?? m.tipo}${m.destinatario ? ` → ${m.destinatario}` : ""} (${m.autor})`, { tam: 9, bold: true });
      if (m.texto) d.texto(m.texto, { tam: 9, recuo: 10, espaco: 2 });
    }
  }
  d.titulo("Conclusão / desfecho");
  d.texto(dem.conclusao || "Demanda ainda não concluída.", { tam: 10 });
}

function corpoInteiroTeor(d: Documento, dados: any) {
  const dem = dados.demanda;
  cabecalho(d, `Certidão de tramitação (inteiro teor) — ${dem.numero}`, dados.anonimizado);
  d.rotuloValor("Título", dem.titulo);
  d.rotuloValor("Situação", dem.situacao);
  d.rotuloValor("Abertura", fmtDataHora(dem.criado_em));
  d.titulo("Movimentações (íntegra)");
  for (const m of dados.movimentacoes || []) {
    d.texto(`${fmtDataHora(m.criado_em)} — ${ROTULO_TIPO[m.tipo] ?? m.tipo}  ·  ${m.autor}${m.destinatario ? ` → ${m.destinatario}` : ""}`, { tam: 9, bold: true });
    if (m.situacao_nova) d.texto(`Situação: ${m.situacao_nova}`, { tam: 8, recuo: 10, cor: rgb(0.35, 0.4, 0.45) });
    if (m.texto) d.texto(m.texto, { tam: 9, recuo: 10 });
    d.linhaFina();
  }
  d.titulo("Relação de anexos");
  if (!dados.anexos?.length) {
    d.texto("Nenhum anexo ativo.", { tam: 10 });
  } else {
    for (const a of dados.anexos) {
      d.texto(`• ${a.nome_original}  (${a.mime ?? "—"}, ${fmtBytes(a.tamanho_bytes)})`, { tam: 9, bold: true });
      d.texto(`Hash: ${a.hash_sha256 ?? "—"} · anexado por ${a.anexado_por} em ${fmtDataHora(a.criado_em)}`, { tam: 8, recuo: 10, cor: rgb(0.35, 0.4, 0.45) });
    }
  }
}

// ------------------------------------------------------------ Geração
async function gerarPdf(tipo: string, dados: any, codigo: string, hash: string, urlValidacao: string): Promise<Uint8Array> {
  const d = new Documento();
  await d.iniciar();
  if (tipo === "resumo") corpoResumo(d, dados); else corpoInteiroTeor(d, dados);
  rodape(d, codigo, hash, urlValidacao);
  return await d.doc.save();
}

// ------------------------------------------------------------ Handler
Deno.serve(async (req) => {
  // Sem este try/catch, uma exceção não tratada vira um 500 gerado pelo
  // runtime — SEM os cabeçalhos CORS. O navegador então esconde o motivo
  // real atrás de "No 'Access-Control-Allow-Origin' header is present",
  // que foi exatamente o que mascarou a falha de codificação do PDF.
  try {
    return await atender(req);
  } catch (e) {
    console.error("Erro não tratado:", e);
    return json({ erro: `Erro interno: ${(e as Error)?.message ?? e}` }, 500);
  }
});

async function atender(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const urlValidacao = `${url.origin}${url.pathname}`;

  // ---- Validação pública ---------------------------------------------
  if (req.method === "GET") {
    const codigo = url.searchParams.get("codigo");
    if (!codigo) return json({ valido: false, erro: "Informe ?codigo=" }, 400);
    const admin = createClient(URL_BASE, SERVICE, { db: { schema: "gestao" } });
    const { data, error } = await admin.rpc("fn_validar_relatorio", { p_codigo: codigo });
    if (error) return json({ valido: false, erro: error.message }, 500);
    if ((req.headers.get("accept") || "").includes("text/html")) {
      return new Response(paginaValidacao(codigo, data), { headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
    }
    return json(data);
  }

  // ---- Emissão --------------------------------------------------------
  if (req.method === "POST") {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ erro: "Sessão obrigatória." }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ erro: "JSON inválido." }, 400); }
    const { demanda_id, tipo, anonimizado } = body ?? {};
    if (!demanda_id || !["resumo", "inteiro_teor"].includes(tipo)) {
      return json({ erro: "Parâmetros: demanda_id e tipo (resumo|inteiro_teor)." }, 400);
    }

    const usuario = createClient(URL_BASE, ANON, { db: { schema: "gestao" }, global: { headers: { Authorization: auth } } });
    const anon = !!anonimizado;

    const { data: dados, error: eDados } = await usuario.rpc("fn_dados_relatorio", { p_demanda_id: demanda_id, p_anonimizado: anon });
    if (eDados) return json({ erro: eDados.message }, 403);
    dados.anonimizado = anon;

    const codigo = gerarCodigo();
    const hash = await sha256hex(`${tipo}|${anon}|${codigo}|${JSON.stringify(dados)}`);
    const pdf = await gerarPdf(tipo, dados, codigo, hash, urlValidacao);

    // Upload ao storage (service role; bucket privado).
    const caminho = `${dados.demanda.numero}/${tipo}-${codigo}.pdf`;
    const admin = createClient(URL_BASE, SERVICE, { db: { schema: "gestao" } });
    const { error: eUp } = await admin.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
    const caminhoGravado = eUp ? null : caminho;

    const { data: id, error: eEmit } = await usuario.rpc("fn_emitir_relatorio", {
      p_demanda_id: demanda_id, p_tipo: tipo, p_anonimizado: anon,
      p_hash: hash, p_codigo: codigo, p_caminho: caminhoGravado,
    });
    if (eEmit) return json({ erro: eEmit.message }, 400);

    return json({ id, codigo, hash, caminho: caminhoGravado, storage_falhou: !!eUp, pdf_base64: paraBase64(pdf) });
  }

  return json({ erro: "Método não suportado." }, 405);
}

// Página HTML mínima para validação humana.
function paginaValidacao(codigo: string, d: any): string {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const corpo = d?.valido
    ? `<p class="ok">✔ Documento autêntico</p>
       <dl>
         <dt>Demanda</dt><dd>${esc(d.demanda_numero)}</dd>
         <dt>Tipo</dt><dd>${d.tipo === "resumo" ? "Relatório-resumo" : "Inteiro teor"}${d.anonimizado ? " (anonimizado)" : ""}</dd>
         <dt>Emitido em</dt><dd>${esc(fmtDataHora(d.emitido_em))}</dd>
         <dt>Emitido por</dt><dd>${esc(d.emitido_por)}</dd>
         <dt>Hash SHA-256</dt><dd class="hash">${esc(d.hash_sha256)}</dd>
       </dl>
       <p class="dica">Confira se o hash acima corresponde ao do documento em suas mãos.</p>`
    : `<p class="erro">✘ Código não encontrado. Documento não localizado.</p>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Validação de documento — SME Ribeirão Preto</title>
    <style>body{font-family:system-ui,Arial,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;color:#1b2027}
    h1{font-size:1.1rem;color:#14539a}.ok{color:#198754;font-weight:700}.erro{color:#dc3545;font-weight:700}
    dl{display:grid;grid-template-columns:auto 1fr;gap:.3rem .8rem}dt{font-weight:600;color:#3a434f}
    .hash{word-break:break-all;font-family:monospace;font-size:.8rem}.dica{color:#6b7684;font-size:.9rem}</style>
    </head><body><h1>Validação de documento — Código ${esc(codigo)}</h1>${corpo}</body></html>`;
}
