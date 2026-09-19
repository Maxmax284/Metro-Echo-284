// MailSection — the inbox's own home in settings.
//
// The booking watch used to hide inside the calendar group, three levels down
// under the Google account's Gmail row. Nobody found it there, and it is not a
// calendar control. This section keeps it at the top level: sign in with Gmail,
// then one explicit switch decides whether Echo watches for bookings.
import { GoogleAccountSection } from "./GoogleAccountSection";

export function MailSection() {
  return (
    <section className="mb-6">
      <div className="mb-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
        <h2 className="text-[13px] font-medium">Bookings from your inbox</h2>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Sign in with Gmail below, then switch on <span className="text-foreground/90">Watch for
          bookings</span>. Echo checks for booking and confirmation mail only, and a flight it reads
          becomes a draft with one question — is this yours? Nothing goes on your board until you
          answer. Boarding passes that arrive as PDF attachments are not read yet.
        </p>
      </div>
      <GoogleAccountSection only={["gmail"]} />
    </section>
  );
}
