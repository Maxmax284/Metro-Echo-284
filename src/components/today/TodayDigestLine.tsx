// TodayDigestLine — one line, once a week, so the weekly read is not buried.
//
// Doctrine: Today stays calm. This renders only while the week's digest is
// unread and the user asked for it on Today. Tapping navigates; nothing runs.
import { CalendarRange, ChevronRight } from "lucide-react";
import { useSherlockDigest } from "@/hooks/useSherlockDigest";
import { useSherlockSettings } from "@/hooks/useSherlockSettings";

export function TodayDigestLine({ onNavigate }: { onNavigate?: (surface: string) => void }) {
  const { digest } = useSherlockDigest();
  const { settings } = useSherlockSettings();

  if (!digest || digest.seen_at) return null;
  if (settings && settings.weekly_digest_today === false) return null;

  return (
    <button
      type="button"
      onClick={() => onNavigate?.("sherlock")}
      className="vanta-card flex w-full items-center gap-2 p-3 text-left transition hover:border-primary/40"
    >
      <CalendarRange className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
          Your week in Sherlock
        </span>
        <span className="block truncate text-[12.5px] leading-snug text-foreground">
          {digest.digest.headline}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
