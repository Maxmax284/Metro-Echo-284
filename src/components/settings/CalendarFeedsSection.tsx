// CalendarFeedsSection — the calendar sense, honestly presented.
//
// Doctrine:
//  - Read-only sense. Subscribing to a calendar never lets Echo write to it,
//    move anything, or act on anything. It only earns Echo the ability to know
//    what starts soon and which promise lands mid-meeting.
//  - Scope-filtered: a calendar added in a workspace belongs to that room only.
//  - Honest status: last check, how many entries, and the real error text when a
//    link stops answering.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { listProjects, type Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { feedStateLine, syncSummary, type FeedSyncResult } from "@/lib/calendarSync";
import { GoogleAccountSection } from "./GoogleAccountSection";

type Feed = {
  id: string;
  label: string;
  url: string;
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  last_added?: number | null;
  last_moved?: number | null;
  last_cancelled?: number | null;
  event_count: number;
  default_project_id: string | null;
};

type UpcomingEvent = { id: string; title: string | null; starts_at: string; all_day: boolean };




function eventLine(e: UpcomingEvent): string {
  const d = new Date(e.starts_at);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = e.all_day
    ? "all day"
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${time} · ${e.title?.trim() || "Untitled entry"}`;
}

export function CalendarFeedsSection() {
  const { session } = useAuth();
  const { applyScope, withScope, key, orgId, destination } = useScope();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);


  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await applyScope(
      supabase.from("calendar_feeds").select("id,label,url,active,last_synced_at,last_error,event_count,default_project_id,last_added,last_moved,last_cancelled"),
    ).order("created_at", { ascending: true });
    setFeeds((data ?? []) as Feed[]);

    const { data: ev } = await applyScope(
      supabase.from("calendar_events").select("id,title,starts_at,all_day"),
    )
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3);
    setUpcoming((ev ?? []) as UpcomingEvent[]);

    setProjects(
      await listProjects({ userId: session.user.id, organizationId: orgId ?? null }).catch(() => [] as Project[]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, key, orgId]);

  /** Everything from this calendar gets filed here from now on. Existing links stay. */
  const setDefaultProject = async (feed: Feed, projectId: string | null) => {
    await supabase.from("calendar_feeds").update({ default_project_id: projectId }).eq("id", feed.id);
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? { ...f, default_project_id: projectId } : f)));
    toast.success(
      projectId
        ? "New entries from this calendar will be filed there."
        : "New entries from this calendar will not be filed anywhere.",
    );
  };

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async (feedId?: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("calendar-sync", {
        body: feedId ? { feed_id: feedId } : {},
      });
      if (error) throw error;
      // A check reports a diff, never a bare "synchronized".
      const results = ((data as { results?: FeedSyncResult[] } | null)?.results ?? []);
      const failed = results.filter((r) => !r.ok).length;
      const { title, description } = syncSummary(results);
      toast[failed && failed === results.length ? "error" : "success"]({ title, description });
      await load();
    } catch {
      toast.error("Could not read the calendar right now.");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const cleanUrl = url.trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https:\/\//i.test(cleanUrl)) {
      toast.error("Paste the secret address of a calendar. It has to start with https or webcal.");
      return;
    }
    if (/calendar\.google\.com\/calendar\/ical\/.*\/public\/basic\.ics/i.test(cleanUrl)) {
      toast.error(
        "That is Google's public address, which only works if the calendar is public. Copy \"Secret address in iCal format\" instead — it has private- in the middle.",
      );
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("calendar_feeds")
      .insert(withScope({ user_id: session!.user.id, label: label.trim() || "My calendar", url: cleanUrl }))
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error) {
      toast.error("Could not save that calendar.");
      return;
    }
    setLabel("");
    setUrl("");
    setAdding(false);
    await load();
    await sync((data as { id: string } | null)?.id);
  };

  const toggle = async (feed: Feed, active: boolean) => {
    await supabase.from("calendar_feeds").update({ active }).eq("id", feed.id);
    await load();
  };

  const remove = async (feed: Feed) => {
    await supabase.from("calendar_feeds").delete().eq("id", feed.id);
    toast.success("Calendar unlinked. Its entries are gone with it.");
    await load();
  };

  if (!session) return null;

  return (
    <section className="vanta-card mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Your calendar
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Sign in with Google and Echo reads your real calendar — and can change it once you approve the
            exact edit. Pasted calendar links stay read-only: Echo sees them, never touches them.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Calendars linked here belong to{" "}
            <span className="font-medium text-foreground/80">{destination}</span> and are invisible in every
            other room. Entries show on Today and in the week ahead in Work.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="vanta-focus h-8 shrink-0 text-[11.5px]"
          onClick={() => void sync()}
          disabled={busy || feeds.length === 0}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <GoogleAccountSection onChanged={() => void load()} hideMailSweep />

      <details className="mt-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
        <summary className="vanta-focus cursor-pointer list-none text-[12px] font-medium">
          Rather paste a link than sign in?
        </summary>
        <div className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground/90">Google Calendar (computer):</span> Settings →
            pick the calendar on the left → Integrate calendar → copy <em>Secret address in iCal format</em>.
            Not the public address above it — that one only works on calendars you have published to the
            world, and it answers 404 otherwise. The right link has{" "}
            <span className="font-mono">private-</span> in the middle.
          </p>
          <p>
            <span className="font-medium text-foreground/90">Apple Calendar (iCloud.com):</span> Calendar →
            click the broadcast icon next to a calendar → Public Calendar → copy the link (it starts with
            webcal, that is fine).
          </p>
          <p>
            <span className="font-medium text-foreground/90">Outlook / Microsoft 365:</span> Settings →
            Calendar → Shared calendars → Publish a calendar → choose <em>Can view all details</em> → copy
            the ICS link.
          </p>
          <p>
            Paste it below, then hit Sync now. Echo re-reads every few minutes on its own; the button is for
            when you just changed something and do not feel like waiting.
          </p>
          <p className="text-foreground/70">
            Keep that link private — anyone holding it can read the calendar.
          </p>
        </div>
      </details>

      {feeds.length === 0 && !adding && (
        <p className="mt-3 rounded-lg bg-background/40 p-3 text-[12px] text-muted-foreground ring-1 ring-border/50">
          Nothing linked yet. In Google Calendar, Apple Calendar or Outlook, copy the calendar's private
          address (it ends in <span className="font-mono">.ics</span>) and paste it below. Entries land here
          and feed Today — they never become tasks on their own.
        </p>
      )}

      {feeds.length > 0 && (
        <ul className="mt-3 divide-y divide-border/40">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{f.label}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {feedStateLine(f)}
                </div>
                <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="shrink-0">Files under</span>
                  <select
                    value={f.default_project_id ?? ""}
                    onChange={(e) => void setDefaultProject(f, e.target.value || null)}
                    className="vanta-focus min-w-0 flex-1 rounded-md bg-background/60 px-1.5 py-1 text-[11px] ring-1 ring-border/60"
                    aria-label={`Default project for ${f.label}`}
                  >
                    <option value="">Nothing by default</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Switch
                checked={f.active}
                onCheckedChange={(v) => void toggle(f, v)}
                aria-label={`Use ${f.label}`}
              />
              <button
                onClick={() => void remove(f)}
                aria-label={`Unlink ${f.label}`}
                className="vanta-focus rounded-md p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <div className="mt-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Next up</div>
          <ul className="mt-1.5 space-y-1">
            {upcoming.map((e) => (
              <li key={e.id} className="font-mono text-[11.5px] text-foreground/85">{eventLine(e)}</li>
            ))}
          </ul>
        </div>
      )}

      {adding ? (
        <div className="mt-3 space-y-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What is this calendar? (Work, Camp, Personal)"
            className="h-9 text-[13px]"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… .ics"
            className="h-9 font-mono text-[12px]"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-[11.5px]" disabled={busy} onClick={() => void add()}>
              Link calendar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[11.5px]"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 h-8 text-[11.5px]"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Link a calendar
        </Button>
      )}
    </section>
  );
}
