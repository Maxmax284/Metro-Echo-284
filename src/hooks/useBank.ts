// useBank — reads money through the one server door. Nothing here can move it.
//
// Doctrine:
//   - The access token is never in the browser; this hook only ever asks the
//     server to read and gets balances and transactions back.
//   - Scope-bound: a workspace link is read in that workspace only.
//   - A refused bank is reported as refused, not hidden.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import type { BankAccount, BankTxn } from "@/lib/bankPlan";

export type BankRead = {
  linked: boolean;
  days: number;
  institutions: string[];
  blocked: string[];
  accounts: BankAccount[];
  transactions: BankTxn[];
};

const EMPTY: BankRead = { linked: false, days: 0, institutions: [], blocked: [], accounts: [], transactions: [] };

async function callBank(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("plaid-bank", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    throw new Error(detail);
  }
  return data as any;
}

export function useBank(days = 30) {
  const { user } = useAuth();
  const { orgId, key } = useScope();
  const [read, setRead] = useState<BankRead>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True when the rail itself has no keys yet — an honest seam, not a failure. */
  const [noRail, setNoRail] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const out = await callBank({ action: "read", days, organization_id: orgId ?? null });
      setRead({ ...EMPTY, ...out });
      setNoRail(false);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "The bank could not be read.";
      if (detail.includes("no_bank_rail")) {
        setNoRail(true);
        setRead(EMPTY);
      } else {
        setError(detail);
      }
    } finally {
      setLoading(false);
    }
  }, [days, orgId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, key]);

  const linkToken = useCallback(
    async () => (await callBank({ action: "link_token", organization_id: orgId ?? null })).link_token as string,
    [orgId],
  );

  const exchange = useCallback(
    async (publicToken: string, institutionName?: string | null) => {
      await callBank({
        action: "exchange",
        public_token: publicToken,
        institution_name: institutionName ?? null,
        organization_id: orgId ?? null,
      });
      await refresh();
    },
    [orgId, refresh],
  );

  const unlink = useCallback(
    async (itemId: string) => {
      await callBank({ action: "unlink", item_id: itemId, organization_id: orgId ?? null });
      await refresh();
    },
    [orgId, refresh],
  );

  return { ...read, loading, error, noRail, refresh, linkToken, exchange, unlink };
}
