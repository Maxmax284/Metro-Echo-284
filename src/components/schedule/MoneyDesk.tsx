// MoneyDesk — what your accounts actually say, and what the days did with it.
//
// Doctrine:
//   - Read only. There is no pay button, no transfer, no staged payment. The
//     standing line says so.
//   - Currencies are never summed across each other.
//   - A refused bank is named as refused. A missing balance is not a zero.
//   - No bank linked is a teaching state, not an error.
import { useMemo, useState } from "react";
import { Banknote, Landmark, Link2, RefreshCw, Unlink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useBank } from "@/hooks/useBank";
import { openPlaid } from "@/lib/plaidLink";
import { vantaToast } from "@/lib/vantaVoice";
import { MONEY_LAW, accountWords, money, planWords, spendPlan, totalsByCurrency } from "@/lib/bankPlan";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function MoneyDesk() {
  const { linked, days, items, blocked, accounts, transactions, loading, error, noRail, refresh, linkToken, exchange, unlink } =
    useBank(30);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => totalsByCurrency(accounts), [accounts]);
  const plans = useMemo(() => spendPlan(transactions, accounts, days || 30), [transactions, accounts, days]);
  const recent = useMemo(
    () => [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 12),
    [transactions],
  );

  const connect = async () => {
    setBusy(true);
    try {
      const token = await linkToken();
      const out = await openPlaid(token);
      if (!out) return; // closed the window; nothing was linked
      await exchange(out.publicToken, out.institutionName);
      vantaToast.success("Bank linked. Echo can read it — nothing more.");
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "The bank could not be linked.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Reading your accounts…" />;

  if (noRail) {
    return (
      <Card className="vanta-card space-y-2 p-4">
        <p className="vanta-machine-label text-foreground/70">Money is not connected</p>
        <p className="text-[12.5px] text-muted-foreground">
          A bank rail needs its own keys before anything can be read. Once they are saved, a Connect a bank button
          appears here and balances follow.
        </p>
        <p className="text-[11px] text-muted-foreground/80">{MONEY_LAW}</p>
      </Card>
    );
  }

  if (error) return <ErrorState detail={error} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-3">
      <p className="vanta-machine-label text-foreground/60">{MONEY_LAW}</p>
      {!linked && <FlowRail beats={FLOWS.money} />}

      {!linked ? (
        <Card className="vanta-card space-y-3 p-4">
          <p className="vanta-machine-label text-foreground/70">No bank linked yet</p>
          <p className="text-[12.5px] text-muted-foreground">
            Link one and your balances, the last 30 days of entries, and what each day cost show up here and on the
            Board. Your bank's own window handles the login — Echo never sees it.
          </p>
          <Button onClick={() => void connect()} disabled={busy} className="h-11 w-full">
            <Link2 className="mr-2 h-4 w-4" aria-hidden /> Connect a bank
          </Button>
        </Card>
      ) : (
        <>
          <Card className="vanta-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" aria-hidden />
              <p className="vanta-machine-label text-foreground/70">On hand</p>
              <button
                type="button"
                aria-label="Read the accounts again"
                onClick={() => void refresh()}
                className={cn("ml-auto rounded-[2px] border border-border/60 p-2", MOTION_FOCUS)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {totals.map((t) => (
                <span key={t.currency} className="text-[17px] tabular-nums text-foreground/90">
                  {money(t.current, t.currency)}
                </span>
              ))}
              {totals.length === 0 && (
                <span className="text-[12.5px] text-muted-foreground">Your bank gave no balance to show.</span>
              )}
            </div>
            <ul className="mt-2 space-y-1">
              {accounts.map((a) => (
                <li key={a.account_id} className="text-[12.5px] text-foreground/80">
                  {accountWords(a)}
                </li>
              ))}
            </ul>
            {blocked.length > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {blocked.join(", ")} refused the read this time, so nothing from there is included.
              </p>
            )}
          </Card>

          {plans.length > 0 && (
            <Card className="vanta-card p-3">
              <p className="vanta-machine-label mb-2 text-foreground/70">The plan, from what happened</p>
              <ul className="space-y-1.5">
                {plans.map((p) => (
                  <li key={p.currency} className="text-[12.5px] text-foreground/85">
                    {planWords(p)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Arithmetic on recorded entries. Not advice, and pending entries are left out until they settle.
              </p>
            </Card>
          )}

          <Card className="vanta-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" aria-hidden />
              <p className="vanta-machine-label text-foreground/70">Last entries</p>
            </div>
            {recent.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Your bank recorded nothing in the last {days} days.
              </p>
            ) : (
              <ul className="space-y-1">
                {recent.map((t) => (
                  <li key={t.transaction_id} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{t.date.slice(5)}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground/90">
                      {t.name}
                      {t.pending ? " · pending" : ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground/80">
                      {t.amount > 0 ? "−" : "+"}
                      {money(Math.abs(t.amount), t.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="vanta-card space-y-2 p-3">
            <p className="vanta-machine-label text-foreground/70">Linked</p>
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.item_id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{it.institution_name || "A bank"}</span>
                  <button
                    type="button"
                    aria-label={`Unlink ${it.institution_name || "this bank"}`}
                    onClick={() => void unlink(it.item_id)}
                    className={cn("shrink-0 rounded-[2px] border border-border/60 p-2", MOTION_FOCUS)}
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void connect()} disabled={busy} className="h-11 flex-1">
                <Link2 className="mr-2 h-4 w-4" aria-hidden /> Add another
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Unlinking ends the reading permission at your bank as well as here.
            </p>
          </Card>
        </>
      )}

      <AftermathHint text="Each day on the Board now says what left and what arrived that day." />
    </div>
  );
}
