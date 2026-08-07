// =====================================================================
// central-bridge — Edge Function (Deno) — Fase 4 (controle de acesso central).
// Sistema de Gestão de Demandas — SME Ribeirão Preto.
//
// POR QUE EXISTE
// --------------
// O login da rede acontece no projeto CENTRAL (smedigital.com.br/central/).
// Este é outro projeto Supabase, com outra chave, e o painel não oferece
// Third-Party Auth com JWKS customizado. Sem a ponte, as consultas sairiam
// como `anon` — que não tem permissão nenhuma, porque toda a autorização do
// sistema é RLS sobre `gestao.usuarios` (regra 4 do CLAUDE.md).
//
// O QUE FAZ
// ---------
// POST (Authorization: Bearer <token do CENTRAL>)
//   1. Confere a assinatura ES256 do token contra o JWKS público do central.
//   2. Confere o domínio institucional do e-mail (a mesma regra do trigger
//      `trg_bloquear_dominio` de sql/012, checada aqui antes para devolver
//      mensagem legível em vez da exceção do Postgres).
//   3. Confere NO CENTRAL que a pessoa tem acesso ao sistema 'lunar'.
//   4. Emite um magic link para esse e-mail AQUI e devolve só o token_hash.
//   O navegador troca o hash por uma sessão deste projeto (verifyOtp) e a
//   partir daí `auth.uid()` volta a funcionar — RLS e funções SECURITY
//   DEFINER seguem valendo exatamente como antes.
//
// Uma chamada por sessão, não uma por consulta.
//
// O QUE **NÃO** FAZ
// -----------------
// Não cria linha em `gestao.usuarios` e não dá acesso ao sistema. Conta nova
// nasce só em `auth.users`, e é assim que ela aparece em
// `fn_listar_contas_pendentes` para um admin liberar por
// `fn_provisionar_usuario` (perfil + unidade). Enquanto isso não acontece, a
// pessoa tem sessão mas nenhuma permissão — que é o comportamento decidido
// na Sessão 3.
//
// A service_role vem do ambiente do Supabase e NUNCA é versionada (regra 10).
//
// ⚠️ DEPLOY: precisa ir SEM verificação de JWT embutida, porque o token que
// chega é de OUTRO projeto e o Supabase o rejeitaria antes de nós:
//     supabase functions deploy central-bridge --no-verify-jwt
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v5.9.6/index.ts";

// Projeto CENTRAL da rede. A anon key é pública por natureza (a segurança
// real é a RLS do central); é a mesma que está em central/config.js.
const CENTRAL_URL = "https://pvdhepvtoavkyoschkod.supabase.co";
const CENTRAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2ZGhlcHZ0b2F2a3lvc2Noa29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUzNDQsImV4cCI6MjA5Nzk5MTM0NH0.BY6jPR9iDvh2xRlGtaU8vdKWp0NKyC7Amlzx-tytmrk";

const SISTEMA = "lunar";
const DOMINIO = "@educacao.pmrp.sp.gov.br";

// O JWKS é buscado uma vez e fica em cache pela lib, com rotação automática.
const JWKS = createRemoteJWKSet(new URL(`${CENTRAL_URL}/auth/v1/.well-known/jwks.json`));

// Não é controle de segurança (chamada servidor-a-servidor ignora CORS), mas
// fecha o uso a partir de outros sites e não custa nada.
const cors = {
  "Access-Control-Allow-Origin": "https://smedigital.com.br",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Cabeçalho HTTP só aceita ASCII imprimível. Um caractere invisível que entre
// na cópia do código (espaço não separável, hífen suave) faz o fetch estourar
// com "not a valid ByteString" — erro que não diz onde está. Chave e token são
// base64url por natureza, então limpar é seguro.
function soAscii(s: string): string {
  return String(s || "").replace(/[^\x21-\x7E]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "metodo_invalido" }, 405);

  try {
    const token = soAscii((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!token) return json({ erro: "sem_token" }, 401);

    // ── 1) A assinatura é mesmo do central? O token ainda vale? ───────────
    let email = "";
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `${CENTRAL_URL}/auth/v1`,
      });
      email = String(payload.email || "").trim().toLowerCase();
    } catch (_e) {
      return json({ erro: "token_invalido" }, 401);
    }
    if (!email) return json({ erro: "token_sem_email" }, 401);

    // ── 2) Domínio institucional ──────────────────────────────────────────
    // O trigger `trg_bloquear_dominio` (sql/012) barraria o INSERT em
    // auth.users de qualquer jeito. Checar aqui antes serve para devolver uma
    // mensagem que o front sabe exibir, em vez de uma exceção do Postgres.
    // O central permite super admin fora do domínio; este sistema, não.
    if (!email.endsWith(DOMINIO)) {
      return json({ erro: "fora_do_dominio", dominio: DOMINIO }, 403);
    }

    // ── 3) O central confirma que essa pessoa pode entrar no lunar ────────
    // Repetido de propósito: o gate do navegador é conforto, não segurança —
    // qualquer um pode chamar esta função direto.
    let r: Response;
    try {
      r = await fetch(`${CENTRAL_URL}/rest/v1/rpc/minhas_permissoes`, {
        method: "POST",
        headers: {
          apikey: soAscii(CENTRAL_ANON),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch (e) {
      return json({ erro: "falha_ao_chamar_central", detalhe: String(e) }, 502);
    }
    if (!r.ok) {
      return json({
        erro: "central_recusou",
        status: r.status,
        detalhe: await r.text().catch(() => ""),
      }, 502);
    }

    const perms = await r.json();
    if (!perms?.autorizado) return json({ erro: "nao_autorizado" }, 403);

    const temLunar = Array.isArray(perms.sistemas)
      && perms.sistemas.some((s: { slug?: string }) => s?.slug === SISTEMA);
    if (!temLunar) return json({ erro: "sem_acesso_ao_lunar" }, 403);

    // O e-mail do token e o das permissões têm que ser o mesmo. Divergiu,
    // alguma coisa está errada — não emite sessão.
    const emailPerms = String(perms?.perfil?.email || "").trim().toLowerCase();
    if (emailPerms && emailPerms !== email) return json({ erro: "email_divergente" }, 403);

    // ── 4) Emite a sessão AQUI, no projeto do lunar ───────────────────────
    const urlLunar = soAscii(Deno.env.get("SUPABASE_URL") || "");
    const chaveLunar = soAscii(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    if (!urlLunar || !chaveLunar) {
      return json({
        erro: "ambiente_incompleto",
        detalhe: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente",
      }, 500);
    }

    const admin = createClient(urlLunar, chaveLunar, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let link = await admin.auth.admin.generateLink({ type: "magiclink", email });

    // Primeiro acesso de alguém que existe no central mas ainda não tem conta
    // aqui: cria e tenta de novo. A conta nasce SEM acesso ao sistema — ela
    // passa a aparecer em `fn_listar_contas_pendentes` para um admin liberar.
    if (link.error) {
      const criado = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (criado.error && !/already/i.test(criado.error.message)) {
        return json({ erro: "falha_ao_criar_usuario", detalhe: criado.error.message }, 500);
      }
      link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    }
    if (link.error) return json({ erro: "falha_ao_gerar_sessao", detalhe: link.error.message }, 500);

    const hash = link.data?.properties?.hashed_token;
    if (!hash) return json({ erro: "sem_hash" }, 500);

    // ── 5) Super admin da rede entra como admin_ti ────────────────────────
    // Sem isto ninguém consegue o primeiro acesso: `fn_provisionar_usuario`
    // exige um admin já cadastrado, e não existe nenhum. A função abaixo é a
    // exceção estreita — só service_role executa, só cria `admin_ti`, audita,
    // e continua sujeita ao CHECK de domínio da tabela.
    // Falha aqui não impede a sessão: a pessoa entra e vê "cadastro
    // pendente", que é um estado tratado e reversível.
    const uid = link.data?.user?.id;
    if (uid && perms?.perfil?.is_super_admin) {
      const { error } = await admin.schema("gestao").rpc("fn_provisionar_super_admin", {
        p_auth_id: uid,
        p_nome: perms?.perfil?.nome || null,
      });
      if (error) console.error("[central-bridge] provisionamento do super admin falhou:", error.message);
    }

    // Devolve também o tipo de verificação: o verifyOtp do navegador precisa
    // usar exatamente este valor, senão o Supabase recusa com
    // "Email link is invalid or has expired".
    return json({
      token_hash: hash,
      tipo: link.data?.properties?.verification_type || "magiclink",
      email,
    });
  } catch (e) {
    return json({ erro: "falha_inesperada", detalhe: String(e) }, 500);
  }
});
