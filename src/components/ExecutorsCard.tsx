import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Webhook, Send } from "lucide-react";

type Executor = {
  id: string;
  name: string;
  kind: "webhook" | "telegram";
  config: any;
  enabled: boolean;
};

export function ExecutorsCard() {
  const { session } = useAuth();
  const [items, setItems] = useState<Executor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"webhook" | "telegram">("webhook");
  const [url, setUrl] = useState("");
  const [chatId, setChatId] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("action_executors").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Executor[]);
    setLoading(false);
  };

  useEffect(() => { if (session) load(); }, [session]);

  const create = async () => {
    if (!session?.user || !name.trim()) return;
    const config = kind === "webhook" ? { url: url.trim() } : { chat_id: Number(chatId) };
    if (kind === "webhook" && !config.url) return toast.error("Webhook URL required");
    if (kind === "telegram" && !config.chat_id) return toast.error("Telegram chat ID required");
    const { error } = await supabase.from("action_executors").insert({
      user_id: session.user.id, name: name.trim(), kind, config, enabled: true,
    });
    if (error) return toast.error(error.message);
    setName(""); setUrl(""); setChatId("");
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Action executors</h3>
        <p className="text-xs text-muted-foreground">Where approved actions get sent. Webhooks fire to any URL; Telegram pings your linked chat.</p>
      </div>

      <div className="rounded-xl surface-elevated p-3 ring-1 ring-border/60 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Zapier hook" />
          </div>
          <div>
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {kind === "webhook" ? (
          <div>
            <Label className="text-xs">URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
        ) : (
          <div>
            <Label className="text-xs">Chat ID</Label>
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" inputMode="numeric" />
          </div>
        )}
        <Button size="sm" onClick={create} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add executor</Button>
      </div>

      <ul className="space-y-2">
        {loading && <li className="text-xs text-muted-foreground">Loading…</li>}
        {!loading && items.length === 0 && <li className="text-xs text-muted-foreground">No executors yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2 rounded-lg surface-elevated p-2 ring-1 ring-border/60">
            {e.kind === "webhook" ? <Webhook className="h-4 w-4 text-muted-foreground" /> : <Send className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{e.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {e.kind === "webhook" ? e.config?.url : `chat ${e.config?.chat_id}`}
              </div>
            </div>
            <Switch checked={e.enabled} onCheckedChange={() => toggle(e)} />
            <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
