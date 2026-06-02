import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, ChevronDown, KeyRound, CheckCircle2, AlertTriangle, HelpCircle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSystemControls, type SystemControls } from "@/hooks/useSystemControls";
import type { IntegrationDef } from "@/lib/integrations/registry";
import { computeStatus, DIRECTION_LABEL, STATUS_LABEL, STATUS_TONE, type RuntimeSignals } from "@/lib/integrations/status";
import type { SecretStatus } from "@/hooks/useSecretsStatus";
import type { ExternalPlatformDiagnostic } from "@/hooks/useExternalPlatformDiagnostics";
import { toast } from "sonner";

type Props = { def: IntegrationDef; signals: RuntimeSignals; secretStatus: SecretStatus; diagnostic?: ExternalPlatformDiagnostic; onSecretsChanged?: () => void | Promise<void> };

function generateSharedSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function IntegrationCard({ def, signals, secretStatus, diagnostic, onSecretsChanged }: Props) {
  const { session } = useAuth();
  const { controls, update } = useSystemControls();
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [count7d, setCount7d] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);

  const status = computeStatus(def, controls, signals);
  const webhookUrl = def.webhookFunction
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${def.webhookFunction}`
    : null;

  useEffect(() => {
    if (!session || !def.auditPrefix) return;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    supabase
      .from("audit_log")
      .select("created_at")
      .eq("user_id", session.user.id)
      .like("event", `${def.auditPrefix}%`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const rows = data ?? [];
        setCount7d(rows.length);
        setLastEventAt(rows[0]?.created_at ?? null);
      });
  }, [session, def.auditPrefix]);

  const killable = !!def.killSwitchKey;
  const killOn = killable && controls ? !!controls[def.killSwitchKey as keyof SystemControls] : null;

  const onToggle = async (v: boolean) => {
    if (!def.killSwitchKey) return;
    try {
      await update({ [def.killSwitchKey]: v } as Partial<SystemControls>);
    } catch {
      toast.error("Couldn't update that switch.");
    }
  };

  const openSecretEditor = (name: string, value = "") => {
    setPasteFor(name);
    setSecretValue(value);
  };

  const saveSecret = async () => {
    if (!pasteFor) return;
    const value = secretValue.trim();
    if (value.length < 16) {
      toast.error("Secret needs at least 16 characters.");
      return;
    }
    setSavingSecret(true);
    const { data, error } = await supabase.functions.invoke("integration-secret-save", {
      body: { secretName: pasteFor, secretValue: value },
    });
    setSavingSecret(false);
    if (error || data?.error) {
      toast.error("Couldn't save secret.", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Secret saved.");
    setPasteFor(null);
    setSecretValue("");
    await onSecretsChanged?.();
  };

  return (
    <section
      id={`integration-${def.key}`}
      className="scroll-mt-24 rounded-xl surface-elevated p-4 ring-1 ring-border/60 target:ring-2 target:ring-primary/70"
    >

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{def.name}</h3>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                STATUS_TONE[status],
              )}
            >
              {STATUS_LABEL[status]}
            </span>
            <span className="rounded-full bg-background/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/40">
              {DIRECTION_LABEL[def.direction]}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{def.role}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">{def.description}</p>
        </div>
        {killable ? (
          <Switch checked={!!killOn} onCheckedChange={onToggle} disabled={def.bucket === "deferred"} />
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {def.bucket === "deferred" ? "Locked off" : "Always on"}
          </span>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-background/40 p-2.5 text-[11.5px] text-muted-foreground ring-1 ring-border/40">
        {def.approvalRule}
      </div>

      {webhookUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Webhook URL</span>
          <code className="break-all rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">{webhookUrl}</code>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success("Webhook URL copied.");
            }}
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
      )}

      {def.expectedSecrets.length > 0 && (
        <div className="mt-3 rounded-lg bg-background/40 p-2.5 ring-1 ring-border/40">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Secrets</span>
            <span className="text-[10px] text-muted-foreground/70">Names only — values never leave the backend.</span>
          </div>
          <ul className="space-y-1">
            {def.expectedSecrets.map((name) => {
              const s = secretStatus[name];
              const present = !!s?.present;
              const unknown = !s;
              const editableSecret = /(_SECRET|_TOKEN)$/.test(name);
              return (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {unknown ? (
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : present ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <code className="truncate rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">{name}</code>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        unknown ? "text-muted-foreground" : present ? "text-emerald-300" : "text-amber-300",
                      )}
                    >
                      {unknown ? "Unknown" : present ? "Present" : "Missing"}
                    </span>
                  </div>
                  {editableSecret && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-1.5 text-[11px]"
                        onClick={() => openSecretEditor(name)}
                      >
                        <Save className="h-3 w-3" /> {present ? "Replace" : "Add secret"}
                      </Button>
                      {!present && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-1.5 text-[11px]"
                          onClick={() => openSecretEditor(name, generateSharedSecret())}
                        >
                          <KeyRound className="h-3 w-3" /> Generate
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            Add or rotate webhook secrets here. Values are never shown again after saving.
          </p>
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
        <CollapsibleTrigger asChild>
          <button className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            Details
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 text-[11.5px]">
          {def.auditPrefix && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <span>
                Last event:{" "}
                <span className="text-foreground/80">
                  {lastEventAt ? new Date(lastEventAt).toLocaleString() : "—"}
                </span>
              </span>
              <span>
                7d count: <span className="text-foreground/80">{count7d}</span>
              </span>
            </div>
          )}

          {def.inboundEvents.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Allowed inbound</div>
              <div className="flex flex-wrap gap-1">
                {def.inboundEvents.map((e) => (
                  <code key={e} className="rounded bg-background/60 px-1 py-0.5 text-[10.5px] ring-1 ring-border/40">
                    {e}
                  </code>
                ))}
              </div>
            </div>
          )}

          {def.outboundCallbacks.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Approved outbound</div>
              <div className="flex flex-wrap gap-1">
                {def.outboundCallbacks.map((e) => (
                  <code key={e} className="rounded bg-background/60 px-1 py-0.5 text-[10.5px] ring-1 ring-border/40">
                    {e}
                  </code>
                ))}
              </div>
            </div>
          )}

          {def.roles && def.roles.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Roles</div>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {def.roles.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Setup</div>
            <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
              {def.setupChecklist.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="text-muted-foreground">
            Test event not available yet. Audit available in main Audit view.
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={!!pasteFor} onOpenChange={(v) => {
        if (!v) {
          setPasteFor(null);
          setSecretValue("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{secretStatus[pasteFor ?? ""]?.present ? "Replace webhook secret" : "Add webhook secret"}</DialogTitle>
            <DialogDescription>
              Paste the shared secret for this platform. Vanta stores it for webhook checks and never displays it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[12.5px]">
            <div className="rounded-lg bg-background/60 p-2.5 ring-1 ring-border/40">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Secret name</div>
              <code className="mt-1 block break-all text-[12px]">{pasteFor}</code>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="integration-secret-value" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Secret value
              </Label>
              <Textarea
                id="integration-secret-value"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="Paste the webhook secret here"
                className="min-h-24 font-mono text-[12px]"
                autoFocus
              />
            </div>
            <div className="rounded-lg bg-background/60 p-2 text-[11.5px] text-muted-foreground ring-1 ring-border/40">
              Use the same value in the other platform's webhook settings. Incoming events that do not match this secret are rejected.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setPasteFor(null);
              setSecretValue("");
            }} disabled={savingSecret}>Cancel</Button>
            {secretValue && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={async () => {
                  await navigator.clipboard.writeText(secretValue);
                  toast.success("Secret copied.");
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            )}
            <Button onClick={saveSecret} disabled={savingSecret || secretValue.trim().length < 16}>
              {savingSecret ? "Saving…" : "Save secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
