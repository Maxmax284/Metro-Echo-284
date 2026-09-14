// CalendarOnlyView — the calendar, and nothing but the calendar.
//
// Doctrine:
//   - Feed rows are sense: read-only, replaced on every sync. Echo's own entries
//     are the person's, and only those can be written here.
//   - The only voice on this page is Echo's own heads-up. Google's alarms are
//     Google's and never appear here. Telegram is not a surface on this page.
//   - Silence is a valid read: an empty day says so plainly.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useAgenda } from "@/hooks/useAgenda";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useCalendarOpenRefresh } from "@/hooks/useCalendarOpenRefresh";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EchoEventSheet } from "@/components/schedule/EchoEventSheet";
import { getGoogleMirrorOn, setGoogleMirrorOn } from "@/lib/echoCalendar";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { CalendarClock, MapPin, Megaphone, Pencil, Plus } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";
import { freshenDayWords } from "@/lib/dayWords";
import type { AgendaEvent } from "@/hooks/useAgenda";

/** Kinds Echo raises off the calendar alone. Nothing else shows here. */
const CALENDAR_KINDS = [
  "appointment_ahead",
  "meeting_starting_soon",
  "meeting_changed",
  "commitment_collides_with_meeting",
] as const;

type CalendarNudge = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
};

export function CalendarOnlyView() {
  const { session, user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const { timezone } = useUserTimezone();
  const { events, loading, refresh } = useAgenda({ days: 14 });
  const [notes, setNotes] = useState<CalendarNudge[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [mirrorOn, setMirrorOn] = useState(true);
  const [mirrorBusy, setMirrorBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getGoogleMirrorOn(user.id).then(setMirrorOn).catch(() => {});
  }, [user?.id]);

  /* One switch, said once: the entry stays here either way. */
  const toggleMirror = async (on: boolean) => {
    if (!user) return;
    setMirrorBusy(true);
    try {
      await setGoogleMirrorOn(user.id, on);
      setMirrorOn(on);
      toast.success(
        on
          ? "New entries will land in Google too, and changes there come back here."
          : "Echo keeps your entries to itself. What Google already holds stays there.",
      );
    } catch {
      toast.error("That switch would not save.");
    } finally {
      setMirrorBusy(false);
    }
  };


  const loadNotes = async () => {
    const { data } = await applyScope(
      supabase.from("nudges").select("id, kind, title, body, created_at"),
    )
      .in("status", ["pending", "seen"])
      .in("kind", CALENDAR_KINDS as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(10);
    setNotes((data ?? []) as CalendarNudge[]);
  };

  useEffect(() => {
    if (session) void loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey]);

  useCalendarOpenRefresh(() => { void loadNotes(); });

  const dayLabel = (iso: string) => formatInTimeZone(new Date(iso), timezone, "EEEE MMM d");
  /* Always the person's own zone — never whatever clock this browser is on. */
  const timeLabel = (e: AgendaEvent) => {
    if (e.all_day) return "all day";
    const start = formatInTimeZone(new Date(e.starts_at), timezone, "h:mm a");
    if (!e.ends_at) return start;
    return `${start}–${formatInTimeZone(new Date(e.ends_at), timezone, "h:mm a")}`;
  };
  const byDay: Record<string, typeof events> = {};
  for (const e of events) (byDay[dayLabel(e.starts_at)] ||= []).push(e);
  const days = Object.keys(byDay);

  return (
    <div className="space-y-3">
      <Card className="vanta-card border-border/60 bg-surface-elevated/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Your own entries</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Entries you add here are yours to edit or delete. Subscribed calendars stay read-only.
            </p>
          </div>
          <Button
            size="sm"
            className="min-h-[44px] shrink-0"
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
          <Label htmlFor="echo-google-mirror" className="text-[11.5px] leading-relaxed">
            Keep these in Google too
          </Label>
          <Switch
            id="echo-google-mirror"
            checked={mirrorOn}
            disabled={mirrorBusy}
            onCheckedChange={(on) => void toggleMirror(on)}
          />
        </div>
      </Card>

      <Card className="vanta-card border-border/60 bg-surface-elevated/40 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Megaphone className="h-3 w-3" /> What Echo said about your calendar
        </div>
        {notes.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Nothing to say right now. Echo speaks once the evening before a real appointment, when a time moves, or when
            something collides — and it stays on this page and Today. Google's own alarms are separate and keep firing
            on their own.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="text-[12.5px]">
                <div className="font-medium">
                  {freshenDayWords({ text: n.title, createdAt: n.created_at, timezone })}
                </div>
                {n.body && (
                  <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                    {freshenDayWords({ text: n.body, createdAt: n.created_at, timezone })}
                  </div>
                )}
                <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                  From Calendar · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
                {/* Reply to what Echo said. Same thread you'd get in Ask. */}
                <HeadsUpReply
                  nudgeId={n.id}
                  label={freshenDayWords({ text: n.title, createdAt: n.created_at, timezone })}
                />

              </li>
            ))}
          </ul>
        )}
      </Card>

      {loading ? (
        <div className="py-10 text-center text-[12px] text-muted-foreground">Reading the calendars…</div>
      ) : days.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 py-10 text-center text-[12px] text-muted-foreground">
          Nothing on the next two weeks that Echo can see. Linked calendars live in Settings under “Your calendar”.
        </div>
      ) : (
        days.map((day) => (
          <Card key={day} className="vanta-card border-border/60 bg-surface-elevated/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> {day}
            </div>
            <ul className="space-y-1.5">
              {byDay[day].map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-[12.5px]">
                  <span className="mt-[3px] w-[76px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {timeLabel(e)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.title ?? "Untitled entry"}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                      <span>{e.feedLabel}</span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" /> {e.location}
                        </span>
                      )}
                      {/* Only ever what the row recorded about the mirror. */}
                      {e.origin === "echo" && e.sync_state === "error" && (
                        <span className="text-destructive">Google would not take this one</span>
                      )}
                      {e.origin === "echo" && e.sync_state === "synced" && <span>In Google too</span>}
                    </div>
                  </div>
                  {e.origin === "echo" ? (
                    <button
                      aria-label={`Edit ${e.title ?? "this entry"}`}
                      className="min-h-[44px] shrink-0 px-2 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setEditing(e);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Subscribed calendars are read-only on purpose — Echo only writes the entries you add here, and nothing on this
        page can be completed or sent anywhere.
      </p>

      <EchoEventSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        event={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
