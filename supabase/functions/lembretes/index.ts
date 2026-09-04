// =====================================================================
// lembretes — Edge Function (Deno).
// Sistema de Gestão de Demandas — SME Ribeirão Preto.
//
// POST  (header x-lembretes-segredo)  →  { gerado_em, resumo, pessoas[] }
//
// Devolve, agrupado por responsável, as tarefas em aberto de cada um.
// Quem envia o e-mail é o Apps Script na conta do gabinete; esta função
// só apura e entrega os dados prontos.
//
// POR QUE ISTO EXISTE, e não uma consulta direta do Apps Script:
// a chave `anon` sozinha não devolve nada (a RLS exige sessão de
// usuário), e a `service_role` num projeto do Apps Script daria a quem
// tem acesso de edição a leitura do banco INTEIRO sem RLS — inclusive
// sigilo restrito e dados de crianças. Projeto de Apps Script se copia,
// se compartilha e se herda junto com a conta. A service_role fica aqui,
// no ambiente do Supabase, e nunca sai.
//
// Publicar com **Verify JWT DESLIGADO** (não há sessão de usuário para
// apresentar): quem protege a rota é o segredo compartilhado, conferido
// em tempo constante logo abaixo.
//
// Segredos vêm do ambiente do Supabase — nada aqui é versionado:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (já existem no projeto)
//   LEMBRETES_SEGREDO                        (criar; o mesmo do Apps Script)
//   LUNAR_BASE_URL                           (opcional; default abaixo)
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("LEMBRETES_SEGREDO") ?? "";
const SITE = Deno.env.get("LUNAR_BASE_URL") ?? "https://smedigital.com.br/lunar";
const FUSO = "America/Sao_Paulo";
const JANELA_DIAS = 7;      // "vence em breve" = daqui a até 7 dias

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Comparação em tempo constante: comparar segredo com === vaza, pelo
// tempo de resposta, quantos caracteres iniciais estão certos.
function segredoConfere(recebido: string): boolean {
  if (!SEGREDO || SEGREDO.length < 16) return false;   // mal configurado: recusa tudo
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(SEGREDO);
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

// Data de hoje em São Paulo, como 'AAAA-MM-DD'. O prazo é DATE no banco,
// então comparar texto com texto é exato — sem fuso, sem hora.
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);         // meio-dia evita virada por fuso
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type Tarefa = {
  id: string; titulo: string; prazo: string | null;
  situacao: string; responsavel_id: string; demanda_id: string;
};
type Demanda = {
  id: string; numero: string; titulo: string;
  sigilo: string; ativo: boolean; situacao: string;
};
type Usuario = { id: string; nome: string; email: string; ativo: boolean };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  if (!segredoConfere(req.headers.get("x-lembretes-segredo") ?? "")) {
    // Mensagem propositalmente vaga: não confirma se o segredo existe.
    return json({ erro: "Não autorizado." }, 401);
  }

  const sb = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

  // Três consultas simples e um cruzamento em memória, em vez de um join
  // aninhado: o volume é de centenas de linhas, e assim não dependemos do
  // nome do constraint da chave estrangeira (que muda entre ambientes).
  const { data: tarefas, error: e1 } = await sb
    .from("tarefas")
    .select("id, titulo, prazo, situacao, responsavel_id, demanda_id")
    .eq("ativo", true)
    .neq("situacao", "concluida");
  if (e1) return json({ erro: "Falha ao ler tarefas.", detalhe: e1.message }, 500);

  const abertas = (tarefas ?? []) as Tarefa[];
  if (!abertas.length) {
    return json({ gerado_em: new Date().toISOString(),
                  resumo: { pessoas: 0, tarefas: 0, vencidas: 0 }, pessoas: [] });
  }

  const idsDemanda = [...new Set(abertas.map((t) => t.demanda_id))];
  const idsPessoa = [...new Set(abertas.map((t) => t.responsavel_id))];

  const [{ data: demandas, error: e2 }, { data: usuarios, error: e3 }] = await Promise.all([
    sb.from("demandas").select("id, numero, titulo, sigilo, ativo, situacao").in("id", idsDemanda),
    sb.from("usuarios").select("id, nome, email, ativo").in("id", idsPessoa),
  ]);
  if (e2) return json({ erro: "Falha ao ler demandas.", detalhe: e2.message }, 500);
  if (e3) return json({ erro: "Falha ao ler usuários.", detalhe: e3.message }, 500);

  const porDemanda = new Map<string, Demanda>(
    ((demandas ?? []) as Demanda[]).map((d) => [d.id, d]));
  const porPessoa = new Map<string, Usuario>(
    ((usuarios ?? []) as Usuario[]).map((u) => [u.id, u]));

  const hoje = hojeSP();
  const limite = somarDias(hoje, JANELA_DIAS);

  // Agrupa por pessoa. Fora: demanda inativa ou concluída (a tarefa ficou
  // órfã de um processo encerrado) e pessoa inativa ou sem e-mail.
  const grupos = new Map<string, {
    nome: string; email: string;
    vencidas: unknown[]; proximas: unknown[]; demais: unknown[];
  }>();

  for (const t of abertas) {
    const d = porDemanda.get(t.demanda_id);
    const u = porPessoa.get(t.responsavel_id);
    if (!d || !d.ativo || d.situacao === "concluida") continue;
    if (!u || !u.ativo || !u.email) continue;

    // Sigilo restrito não viaja por e-mail: a pessoa já tem acesso ao
    // conteúdo no sistema, ele só não precisa ficar na caixa de entrada,
    // encaminhável e em backup. O título da tarefa também é texto livre.
    const sigiloso = d.sigilo === "restrito";
    const item = {
      demanda_numero: d.numero,
      titulo: sigiloso ? null : (t.titulo || d.titulo),
      sigiloso,
      prazo: t.prazo,
      situacao: t.situacao,
      link: `${SITE}/pages/demanda.html?id=${encodeURIComponent(d.id)}`,
    };

    if (!grupos.has(u.id)) {
      grupos.set(u.id, { nome: u.nome, email: u.email, vencidas: [], proximas: [], demais: [] });
    }
    const g = grupos.get(u.id)!;
    if (t.prazo && t.prazo < hoje) g.vencidas.push(item);
    else if (t.prazo && t.prazo <= limite) g.proximas.push(item);
    else g.demais.push(item);
  }

  // Mais atrasado primeiro: quem abre o e-mail lê o que já estourou.
  const pessoas = [...grupos.values()]
    .map((g) => ({ ...g, total: g.vencidas.length + g.proximas.length + g.demais.length }))
    .sort((a, z) => z.vencidas.length - a.vencidas.length || z.total - a.total);

  return json({
    gerado_em: new Date().toISOString(),
    hoje,
    janela_dias: JANELA_DIAS,
    resumo: {
      pessoas: pessoas.length,
      tarefas: pessoas.reduce((s, p) => s + p.total, 0),
      vencidas: pessoas.reduce((s, p) => s + p.vencidas.length, 0),
    },
    pessoas,
  });
});
