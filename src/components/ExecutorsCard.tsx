import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Webhook, Send, CalendarDays, Mail } from "lucide-react";

type Kind = "webhook" | "telegram" | "google_calendar" | "email";

type Executor = {
  id: string;
  name: string;
  kind: Kind;
  config: any;
  enabled: boolean;
};

const COMMON_TZ = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function ExecutorsCard() {
  const { session } = useAuth();
  const [items, setItems] = useState<Executor[]>([]);
  const [loading, setLoading] = useState(true);

  // shared
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("webhook");

  // webhook
  const [url, setUrl] = useState("");

  // telegram
  const [chatId, setChatId] = useState("");

  // google_calendar
  const [calendarId, setCalendarId] = useState("primary");
  const [timeZone, setTimeZone] = useState(
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC",
  );
  const [startField, setStartField] = useState("start");
  const [endField, setEndField] = useState("end");
  const [duration, setDuration] = useState("30");
  const [summaryTpl, setSummaryTpl] = useState("{{title}}");
  const [descTpl, setDescTpl] = useState("{{description}}");
  const [attendees, setAttendees] = useState("");

  // email
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("Vanta <onboarding@resend.dev>");
  const [emailSubject, setEmailSubject] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("action_executors").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Executor[]);
    setLoading(false);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const create = async () => {
    if (!session?.user || !name.trim()) return toast.error("Name required");
    let config: Record<string, unknown> = {};
    if (kind === "webhook") {
      if (!url.trim()) return toast.error("Webhook URL required");
      config = { url: url.trim() };
    } else if (kind === "telegram") {
      if (!chatId) return toast.error("Telegram chat ID required");
      config = { chat_id: Number(chatId) };
    } else if (kind === "google_calendar") {
      const dur = Number(duration);
      const list = attendees.split(",").map((s) => s.trim()).filter(Boolean);
      config = {
        calendar_id: calendarId.trim() || "primary",
        timeZone,
        start_field: startField.trim() || "start",
        end_field: endField.trim() || "end",
        default_duration_minutes: Number.isFinite(dur) && dur > 0 ? dur : 30,
        summary_template: summaryTpl,
        description_template: descTpl,
        ...(list.length ? { attendees: list } : {}),
      };
    } else if (kind === "email") {
      const list = emailTo.split(",").map((s) => s.trim()).filter(Boolean);
      if (!list.length) return toast.error("At least one recipient required");
      config = { to: list, from: emailFrom.trim(), subject: emailSubject.trim() || undefined };
    }
    const { error } = await supabase.from("action_executors").insert({
      user_id: session.user.id, name: name.trim(), kind, config, enabled: true,
    });
    if (error) return toast.error(error.message);
    setName(""); setUrl(""); setChatId("");
    setEmailTo(""); setEmailSubject("");
    setAttendees("");
    toast.success("Executor added");
    load();
  };

  const toggle = async (e: Executor) => {
    await supabase.from("action_executors").update({ enabled: !e.enabled }).eq("id", e.id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("action_executors").delete().eq("id", id);
    load();
  };

  const summary = (e: Executor) => {
    if (e.kind === "webhook") return e.config?.url;
    if (e.kind === "telegram") return `chat ${e.config?.chat_id}`;
    if (e.kind === "google_calendar") return `${e.config?.calendar_id ?? "primary"} · ${e.config?.timeZone ?? "UTC"}`;
    if (e.kind === "email") return `to ${(e.config?.to ?? []).join(", ")}`;
    return "";
  };

  const Icon = (k: Kind) => {
    if (k === "webhook") return <Webhook className="h-4 w-4 text-muted-foreground" />;
    if (k === "telegram") return <Send className="h-4 w-4 text-muted-foreground" />;
    if (k === "google_calendar") return <CalendarDays className="h-4 w-4 text-muted-foreground" />;
    return <Mail className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Action executors</h3>
        <p className="text-xs text-muted-foreground">
          Where approved actions get sent. Webhooks fire to any URL; Telegram pings your linked chat;
          Google Calendar creates events; Email sends via Resend.
        </p>
      </div>

      <div className="rounded-xl surface-elevated p-3 ring-1 ring-border/60 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team calendar" />
          </div>
          <div>
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="google_calendar">Google Calendar</SelectItem>
                <SelectItem value="email">Email (Resend)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {kind === "webhook" && (
          <div>
            <Label className="text-xs">URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
        )}

        {kind === "telegram" && (
          <div>
            <Label className="text-xs">Chat ID</Label>
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" inputMode="numeric" />
          </div>
        )}

        {kind === "google_calendar" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Calendar ID</Label>
                <Input value={calendarId} onChange={(e) => setCalendarId(e.target.value)} placeholder="primary or you@domain.com" />
              </div>
              <div>
                <Label className="text-xs">Time zone</Label>
                <Select value={timeZone} onValueChange={setTimeZone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_TZ.includes(timeZone) ? null : <SelectItem value={timeZone}>{timeZone}</SelectItem>}
                    {COMMON_TZ.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Start field</Label>
                <Input value={startField} onChange={(e) => setStartField(e.target.value)} placeholder="start" />
              </div>
              <div>
                <Label className="text-xs">End field</Label>
                <Input value={endField} onChange={(e) => setEndField(e.target.value)} placeholder="end" />
              </div>
              <div>
                <Label className="text-xs">Default duration (min)</Label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" placeholder="30" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Summary template</Label>
              <Input value={summaryTpl} onChange={(e) => setSummaryTpl(e.target.value)} placeholder="{{title}}" />
            </div>
            <div>
              <Label className="text-xs">Description template</Label>
              <Input value={descTpl} onChange={(e) => setDescTpl(e.target.value)} placeholder="{{description}}" />
            </div>
            <div>
              <Label className="text-xs">Default attendees (comma-separated emails)</Label>
              <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alice@x.com, bob@y.com" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Reads <code>action.payload.{startField || "start"}</code> / <code>{endField || "end"}</code> as ISO 8601.
              If only start is present, end is computed from default duration. Use <code>{"{{title}}"}</code> /{" "}
              <code>{"{{description}}"}</code> in templates.
            </p>
          </div>
        )}

        {kind === "email" && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">To (comma-separated)</Label>
              <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="alice@x.com, bob@y.com" />
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="Vanta <hi@yourdomain.com>" />
            </div>
            <div>
              <Label className="text-xs">Subject (optional, defaults to action title)</Label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="" />
            </div>
            <p className="text-[11px] text-muted-foreground">Requires the Resend connector to be linked.</p>
          </div>
        )}

        <Button size="sm" onClick={create} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add executor</Button>
      </div>

      <ul className="space-y-2">
        {loading && <li className="text-xs text-muted-foreground">Loading…</li>}
        {!loading && items.length === 0 && <li className="text-xs text-muted-foreground">No executors yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2 rounded-lg surface-elevated p-2 ring-1 ring-border/60">
            {Icon(e.kind)}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{e.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{summary(e)}</div>
            </div>
            <Switch checked={e.enabled} onCheckedChange={() => toggle(e)} />
            <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
