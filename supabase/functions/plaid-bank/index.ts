// plaid-bank — the one door to a bank rail.
//
// Doctrine:
//   - Read only. This function creates a link, then reads balances and
//     transactions. There is no payment arm, no transfer arm, and there never
//     will be one here: money moving is not something Echo does.
//   - The access token never leaves the server. The browser gets balances and
//     transactions; it never gets the token, and the table does not grant that
//     column to any client role.
//   - Scope is respected: a link recorded for a workspace is read in that
//     workspace only.
//   - Every read leaves a receipt in audit_log.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MONEY_LAW, type BankAccount, type BankTxn } from "../_shared/bankPlan.ts";

const CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const SECRET = Deno.env.get("PLAID_SECRET");
const ENVIRONMENT = (Deno.env.get("PLAID_ENV") || "sandbox").toLowerCase();

const HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** One call to Plaid. Its own error body is surfaced, never swallowed. */
async function plaid(path: string, body: Record<string, unknown>) {
  const host = HOSTS[ENVIRONMENT] ?? HOSTS.sandbox;
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, secret: SECRET, ...body }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Plaid ${path} failed [${res.status}]: ${text}`);
    throw new Error(`[${res.status}] ${text}`);
  }
  return JSON.parse(text || "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !SECRET) {
      return json(
        { error: "no_bank_rail", message: "No Plaid client id and secret are configured, so no bank can be read." },
        503,
      );
    }

    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: who } = await asUser.auth.getUser();
    const user = who?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    // Server-side client: the only thing allowed to touch the access token.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const orgId: string | null = body?.organization_id ?? null;

    const receipt = (event: string, payload: Record<string, unknown>) =>
      admin.from("audit_log").insert({
        user_id: user.id,
        organization_id: orgId,
        entity_type: "bank",
        event,
        payload: { ...payload, environment: ENVIRONMENT, law: MONEY_LAW },
      });

    const links = async () => {
      const q = admin
        .from("bank_links")
        .select("id, item_id, access_token, institution_name, accounts")
        .eq("user_id", user.id)
        .eq("active", true);
      const { data, error } = orgId ? await q.eq("organization_id", orgId) : await q.is("organization_id", null);
      if (error) throw error;
      return data ?? [];
    };

    if (action === "link_token") {
      // The browser needs a short-lived token to open Plaid's own consent flow.
      const out = await plaid("/link/token/create", {
        user: { client_user_id: user.id },
        client_name: "Metro Echo",
        products: ["transactions"],
        country_codes: body?.country_codes ?? ["US"],
        language: "en",
      });
      return json({ link_token: out.link_token, environment: ENVIRONMENT });
    }

    if (action === "exchange") {
      const publicToken = String(body?.public_token || "");
      if (!publicToken) return json({ error: "public_token is required" }, 400);
      const ex = await plaid("/item/public_token/exchange", { public_token: publicToken });
      const accountsOut = await plaid("/accounts/get", { access_token: ex.access_token });
      const institution = body?.institution_name ?? accountsOut?.item?.institution_id ?? null;
      const { error } = await admin.from("bank_links").upsert(
        {
          user_id: user.id,
          organization_id: orgId,
          item_id: ex.item_id,
          access_token: ex.access_token,
          institution_name: institution,
          accounts: accountsOut.accounts ?? [],
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "user_id,item_id" },
      );
      if (error) throw error;
      await receipt("bank.linked", { institution_name: institution, accounts: (accountsOut.accounts ?? []).length });
      return json({ ok: true, institution_name: institution });
    }

    if (action === "read") {
      const rows = await links();
      if (!rows.length) return json({ linked: false, accounts: [], transactions: [] });

      const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 180);
      const end = new Date();
      const start = new Date(end.getTime() - days * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const accounts: BankAccount[] = [];
      const transactions: BankTxn[] = [];
      const institutions: string[] = [];
      const blocked: string[] = [];

      for (const row of rows as Array<{ access_token: string; institution_name: string | null }>) {
        if (row.institution_name) institutions.push(row.institution_name);
        try {
          const bal = await plaid("/accounts/balance/get", { access_token: row.access_token });
          for (const a of bal.accounts ?? []) {
            accounts.push({
              account_id: a.account_id,
              name: a.official_name || a.name,
              mask: a.mask ?? null,
              type: a.type ?? null,
              subtype: a.subtype ?? null,
              current: a.balances?.current ?? null,
              available: a.balances?.available ?? null,
              currency: a.balances?.iso_currency_code ?? a.balances?.unofficial_currency_code ?? null,
            });
          }
          const tx = await plaid("/transactions/get", {
            access_token: row.access_token,
            start_date: iso(start),
            end_date: iso(end),
            options: { count: 250, offset: 0 },
          });
          for (const t of tx.transactions ?? []) {
            transactions.push({
              transaction_id: t.transaction_id,
              account_id: t.account_id,
              amount: t.amount,
              currency: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
              date: t.date,
              name: t.merchant_name || t.name,
              category: Array.isArray(t.category) ? t.category[0] : (t.personal_finance_category?.primary ?? null),
              pending: !!t.pending,
            });
          }
        } catch (e) {
          // One bank refusing does not erase the others; the refusal is said plainly.
          blocked.push(row.institution_name || "a linked bank");
          console.error("bank read blocked:", e instanceof Error ? e.message : e);
        }
      }

      await admin
        .from("bank_links")
        .update({ last_read_at: new Date().toISOString() })
        .eq("user_id", user.id);
      await receipt("bank.read", { accounts: accounts.length, transactions: transactions.length, days });

      return json({ linked: true, days, institutions, blocked, accounts, transactions });
    }

    if (action === "unlink") {
      const itemId = String(body?.item_id || "");
      if (!itemId) return json({ error: "item_id is required" }, 400);
      const { data: row } = await admin
        .from("bank_links")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("item_id", itemId)
        .maybeSingle();
      if (row?.access_token) {
        try {
          await plaid("/item/remove", { access_token: row.access_token });
        } catch (e) {
          console.error("plaid item remove failed:", e instanceof Error ? e.message : e);
        }
      }
      const { error } = await admin.from("bank_links").delete().eq("user_id", user.id).eq("item_id", itemId);
      if (error) throw error;
      await receipt("bank.unlinked", { item_id: itemId });
      return json({ ok: true });
    }

    return json({ error: "unknown_action", message: "This door reads a bank. It does not move money." }, 400);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: "bank_read_failed", details: detail }, 502);
  }
});
