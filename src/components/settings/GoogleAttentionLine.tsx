// GoogleAttentionLine — the Control Room's one notice for a dead Google grant.
//
// The health line above watches platform plumbing (Telegram, inbound mail
// boxes), not your personal Google sign-in. When a grant expired, every
// surface said "switch it on" while the Control Room itself stayed silent and
// offered no door. This line makes the way back in painfully obvious: one
// sentence, one link straight to the room holding the Sign in again button.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { readGoogleAccountStatus } from "@/lib/googleServices";
import {
  GOOGLE_CAPABILITIES,
  googleStateFrom,
  statusFor,
  type GoogleCapability,
} from "@/lib/googleEcosystem";

/** Where each service's own row (and its button) lives. Drive shares the calendar room. */
const ROOM_ROUTE: Record<GoogleCapability["key"], string> = {
  calendar: "/settings/g/time",
  gmail: "/settings/g/mail",
  drive: "/settings/g/time",
  tasks: "/settings/g/time",
};

const ROOM_NAME: Record<GoogleCapability["key"], string> = {
  calendar: "Time and calendar",
  gmail: "Your inbox",
  drive: "Time and calendar",
  tasks: "Time and calendar",
};

export function GoogleAttentionLine() {
  const { session } = useAuth();
  const [failing, setFailing] = useState<GoogleCapability[] | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      try {
        const state = googleStateFrom(await readGoogleAccountStatus());
        const dead = GOOGLE_CAPABILITIES.filter(
          (c) => c.wired && statusFor(c, state)?.failing === true,
        );
        if (alive) setFailing(dead);
      } catch {
        /* A failed read never invents a problem — the line stays quiet. */
        if (alive) setFailing([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  if (!session || !failing || failing.length === 0) return null;

  const first = failing[0];
  const what =
    failing.length === 1
      ? `Google stopped answering for your ${first.label === "Gmail" ? "mail" : first.label.toLowerCase()}.`
      : `Google stopped answering for ${failing.map((c) => c.label).join(" and ")}.`;

  return (
    <Link
      to={ROOM_ROUTE[first.key]}
      className="vanta-focus group mb-4 flex items-center gap-2.5 rounded-xl bg-destructive/10 px-3.5 py-2.5 ring-1 ring-destructive/30 hover:ring-destructive/50"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-foreground">{what}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          The Sign in again button is waiting in {ROOM_NAME[first.key]} — one tap and it clears itself.
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
