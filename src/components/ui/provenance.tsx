// ProvenanceChip — one source marker, never two.
//
// Doctrine: "where did this come from" is a fact Echo already stored. Say it
// in plain words (From Telegram, Added by you) and stop there. No infrastructure
// names, no connector ids, no raw payload keys.
import {
  AtSign,
  Building2,
  CalendarClock,
  Dumbbell,
  Globe,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  MessageCircle,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { PROVENANCE_LABEL, resolveProvenance, type ProvenanceSource } from "@/lib/vantaNouns";
import { ago } from "@/lib/connections";
import { cn } from "@/lib/utils";

const ICON: Record<ProvenanceSource, LucideIcon> = {
  telegram: Send,
  whatsapp: MessageCircle,
  email: AtSign,
  calendar: CalendarClock,
  you: User,
  upload: Upload,
  website: Globe,
  sherlock: Search,
  ask: MessagesSquare,
  vanta: Sparkles,
  hub: Building2,
  campcore: Dumbbell,
  fenrir: ShieldCheck,
};

/** The plain-language source label, or null when nothing was recorded. */
export function provenanceText(raw: string | null | undefined): string | null {
  const src = resolveProvenance(raw);
  return src ? PROVENANCE_LABEL[src] : null;
}

export function ProvenanceChip({
  source,
  className,
  showLabel = true,
}: {
  /** Whatever the record stored: "telegram", "email_inbound", "you"… */
  source: string | null | undefined;
  className?: string;
  showLabel?: boolean;
}) {
  const resolved = resolveProvenance(source);
  if (!resolved) return null;
  const Icon = ICON[resolved];
  const label = PROVENANCE_LABEL[resolved];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10.5px] text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {showLabel ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

/**
 * ProvenanceStrip — "From Telegram · 2m". One line, source then freshness.
 *
 * The shared strip for anything Echo surfaced on its own: a person should be
 * able to answer "where did this come from and how fresh is it" without
 * tapping. Falls back to the plain label when no time was recorded, and to the
 * time alone when no source was.
 */
export function ProvenanceStrip({
  source,
  at,
  className,
}: {
  source: string | null | undefined;
  /** ISO timestamp of the newest fact behind the item. */
  at: string | null | undefined;
  className?: string;
}) {
  const label = provenanceText(source);
  const when = ago(at);
  if (!label && !when) return null;

  return (
    <span className={cn("vanta-machine inline-flex items-center gap-1 text-[10px] tracking-[0.08em] text-muted-foreground/80", className)}>
      {label ? <span className="truncate">{label}</span> : null}
      {label && when ? <span aria-hidden>·</span> : null}
      {when ? <span>{when}</span> : null}
    </span>
  );
}
