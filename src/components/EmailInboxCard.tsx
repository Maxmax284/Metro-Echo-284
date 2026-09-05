import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Mail, RefreshCw } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

function newSlug() {
  return Math.random().toString(36).slice(2, 10);
}

export function EmailInboxCard() {
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("email_inbound_addresses")
      .select("slug,last_received_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) { setSlug(data.slug); setLastAt(data.last_received_at); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const ensureSlug = async () => {
    if (!user) return;
    setBusy(true);
    try {
      let candidate = slug ?? newSlug();
      for (let i = 0; i < 5; i++) {
        const { error } = await supabase
          .from("email_inbound_addresses")
          .upsert({ user_id: user.id, slug: candidate, active: true }, { onConflict: "user_id" });
        if (!error) { setSlug(candidate); break; }
        candidate = newSlug();
      }
      toast.success("Inbound address ready.");
    } catch (e) {
      toast.fromError(e);
    } finally { setBusy(false); }
  };

  const rotate = async () => {
    if (!user) return;
    setBusy(true);
    const candidate = newSlug();
    const { error } = await supabase
      .from("email_inbound_addresses")
      .update({ slug: candidate })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) return toast.error(vantaSay.couldntSave());
    setSlug(candidate);
    toast.success("Address rotated.");
  };

  /* The only real address is the forwarding endpoint. Metro Echo does not run a
     mail domain, so no friendly-looking address is invented here — printing one
     would be a promise the platform can't keep. */
  const webhookUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/email-inbound?slug=${slug ?? ""}`;


  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success(vantaSay.copied()); };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Email into memory</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-xs">
        {!slug ? (
          <Button size="sm" onClick={ensureSlug} disabled={busy} className="gap-1">
            <Mail className="h-3.5 w-3.5" /> Create inbound address
          </Button>
        ) : (
          <>
            <div>
              <div className="text-muted-foreground">Your inbound key</div>
              <div className="flex items-center gap-1">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{slug}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copy inbound key" onClick={() => copy(slug!)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                Metro Echo doesn't run its own mail domain. Point a forwarding service at the address
                below and mail arrives here as a draft.
              </p>
            </div>

            <div>
              <div className="text-muted-foreground">Webhook URL (for SendGrid/Mailgun/Postmark inbound)</div>
              <div className="flex items-center gap-1">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{webhookUrl}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copy webhook URL" onClick={() => copy(webhookUrl)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Last received: {lastAt ? new Date(lastAt).toLocaleString() : "never"}
            </div>
            <Button size="sm" variant="outline" onClick={rotate} disabled={busy} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Rotate
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
