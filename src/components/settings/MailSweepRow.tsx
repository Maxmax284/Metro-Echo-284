// MailSweepRow — one switch, and the truth about what it does.
//
// It sits under Gmail because it is a Gmail permission being used, not a new
// service. The copy says what gets read, what never gets kept, and that nothing
// it finds goes anywhere without an answer.
import { Switch } from "@/components/ui/switch";
import { useMailSweep } from "@/hooks/useMailSweep";

export function MailSweepRow() {
  const { enabled, lastSweptAt, lastError, found7d, busy, setEnabled } = useMailSweep();
  /* Google's own refusal, told apart from an ordinary hiccup. */
  const blocked = !!lastError && /switched off/i.test(lastError);
  /* The grant itself died — the way back is the button above, not this switch. */
  const needsSignIn = !!lastError && !blocked && /sign in again/i.test(lastError);

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
      {/* A switch that looks armed while Google refuses every read is a lie.
          When Google itself has the service switched off, say so and give the
          one thing to click — nothing here can fix it from this side. */}
      {blocked ? (
        <div className="mt-1.5 rounded-md bg-destructive/10 p-2 ring-1 ring-destructive/30">
          <p className="text-[10.5px] leading-snug text-foreground/90">
            Switched on here, but blocked by Google: the Gmail API is off in the Google Cloud project
            behind your sign-in, so no mail reaches Echo. Turn it on there and this clears itself on
            the next look — no reconnect, no signing in again.
          </p>
          <a
            href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[10.5px] underline underline-offset-2"
          >
            Open the Gmail API page in Google Cloud
          </a>
        </div>
      ) : needsSignIn ? (
        <div className="mt-1.5 rounded-md bg-destructive/10 p-2 ring-1 ring-destructive/30">
          <p className="text-[10.5px] leading-snug text-foreground/90">
            The watch is still on here, but Google isn't answering — your sign-in expired. Hit
            <span className="font-medium"> Sign in again </span>
            just above and this clears itself on the next look. This switch stays exactly as you left it.
          </p>
        </div>
      ) : lastError ? (
        <p className="mt-1 text-[10.5px] text-destructive">{lastError}</p>
      ) : null}
    </div>
  );
}
