// bankRead — what the accounts say, in one sentence, from the bank's own record.
//
// Doctrine:
//   - Read only. There is no arm here that moves money, and none will be added.
//   - The access token stays server-side: this module opens its own service-role
//     client rather than expecting a caller to hold a token it must not see.
//   - No bank linked is a real answer, not an error. A refused bank is named.
//   - Nothing is converted between currencies and nothing is called sensible.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MONEY_LAW,
  NO_BANK,
  money,
  planWords,
  spendPlan,
  totalsByCurrency,
  type BankAccount,
  type BankTxn,
} from "./bankPlan.ts";

const HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export function bankRailReady(): boolean {
  return !!Deno.env.get("PLAID_CLIENT_ID") && !!Deno.env.get("PLAID_SECRET");
}

async function plaid(path: string, body: Record<string, unknown>) {
  const env = (Deno.env.get("PLAID_ENV") || "sandbox").toLowerCase();
  const res = await fetch(`${HOSTS[env] ?? HOSTS.sandbox}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret: Deno.env.get("PLAID_SECRET"),
      ...body,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return JSON.parse(text || "{}");
}

/** The money answer in words: balances on hand, then what the days did with them. */
export function formatBank(
  accounts: BankAccount[],
  txns: BankTxn[],
  days: number,
  blocked: string[],
): string {
  const totals = totalsByCurrency(accounts);
  if (!totals.length && !txns.length) {
    return `A bank is linked but it gave no balance and no entries for the last ${days} days. ${MONEY_LAW}`;
  }
  const onHand = totals.length
    ? `On hand: ${totals.map((t) => money(t.current, t.currency)).join(", ")}.`
    : "Your bank gave no balance.";
  const plans = spendPlan(txns, accounts, days);
  const plan = plans.length ? ` ${plans.map(planWords).join(" ")}` : ` Nothing settled in the last ${days} days.`;
  const refused = blocked.length ? ` ${blocked.join(", ")} refused the read, so nothing from there is counted.` : "";
  return `${onHand}${plan}${refused} ${MONEY_LAW}`;
}

export async function bankRead(
  _sb: unknown,
  { userId, orgId }: { userId: string; orgId: string | null },
  { days = 30 }: { days?: number } = {},
): Promise<string> {
  if (!bankRailReady()) {
    return "No bank rail is configured, so there are no balances to read.";
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const base = admin
    .from("bank_links")
    .select("item_id, access_token, institution_name")
    .eq("user_id", userId)
    .eq("active", true);
  const { data } = orgId ? await base.eq("organization_id", orgId) : await base.is("organization_id", null);
  const rows = (data ?? []) as Array<{ access_token: string; institution_name: string | null }>;
  if (!rows.length) return NO_BANK;

  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const accounts: BankAccount[] = [];
  const txns: BankTxn[] = [];
  const blocked: string[] = [];

  for (const row of rows) {
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
        txns.push({
          transaction_id: t.transaction_id,
          account_id: t.account_id,
          amount: t.amount,
          currency: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
          date: t.date,
          name: t.merchant_name || t.name,
          pending: !!t.pending,
        });
      }
    } catch (e) {
      blocked.push(row.institution_name || "a linked bank");
      console.error("bankRead blocked:", e instanceof Error ? e.message : e);
    }
  }
  return formatBank(accounts, txns, days, blocked);
}
