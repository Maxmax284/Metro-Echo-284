// ProvenanceChip — one source marker, never two.
//
// Doctrine: "where did this come from" is a fact Vanta already stored. Say it
// in plain words (From Telegram, Added by you) and stop there. No infrastructure
// names, no connector ids, no raw payload keys.
import {
  AtSign,
  CalendarClock,
  Globe,
  Search,
  Send,
  Sparkles,
  Upload,
  User,
  MessageCircle,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { PROVENANCE_LABEL, resolveProvenance, type ProvenanceSource } from "@/lib/vantaNouns";
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
