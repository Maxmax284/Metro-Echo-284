// MailSweepRow — one switch, and the truth about what it does.
//
// It sits under Gmail because it is a Gmail permission being used, not a new
// service. The copy says what gets read, what never gets kept, and that nothing
// it finds goes anywhere without an answer.
import { Switch } from "@/components/ui/switch";
import { useMailSweep } from "@/hooks/useMailSweep";

export function MailSweepRow() {
  const { enabled, lastSweptAt, lastError, found7d, busy, setEnabled } = useMailSweep();

  return (
    <div className="mt-2 rounded-md bg-background/40 p-2 ring-1 ring-border/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium">Watch for bookings</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
            Once an hour Echo asks Gmail for booking and confirmation mail only, reads the subject
            lines, and opens a body only when that message says it carries a booking. A flight it
            reads becomes a draft with one question: is this yours? Nothing goes on your board until
            you answer.
          </p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => void setEnabled(v)} />
      </div>
      {enabled ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
          <span>
            Last look:{" "}
            <span className="text-foreground/80">
              {lastSweptAt ? new Date(lastSweptAt).toLocaleString() : "not yet"}
            </span>
          </span>
          <span>
            Found in 7 days: <span className="text-foreground/80">{found7d}</span>
          </span>
          <span>No message body is kept — only the subject line, so Receipts can say where a flight came from.</span>
        </div>
      ) : null}
      {lastError ? <p className="mt-1 text-[10.5px] text-destructive">{lastError}</p> : null}
    </div>
  );
}
