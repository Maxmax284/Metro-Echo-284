import { Button } from "@/components/ui/button";
import { Copy, KeyRound } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { buildSpokeKit, type SpokeKitInput } from "@/lib/integrations/spokeKit";

/**
 * Shown once, right after a spoke secret is saved. The value is already stored
 * in the backend and will never be displayed again, so this is the only chance
 * to hand it to the other platform.
 */
export function SpokeKitPanel({ kit, onDone }: { kit: SpokeKitInput; onDone: () => void }) {
  const text = buildSpokeKit(kit);
  return (
    <div className="mt-3 rounded-lg bg-primary/10 p-2.5 ring-1 ring-primary/30">
      <div className="mb-1.5 flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10.5px] uppercase tracking-wider text-primary">Spoke credentials — shown once</span>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Give this to {kit.platformName}. It has the webhook address, the shared secret, and the exact way to sign a
        notice so Echo trusts it. Copy it now — the secret is not shown again.
      </p>
      <dl className="mt-2 space-y-1 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Webhook URL</dt>
          <dd><code className="break-all">{kit.webhookUrl}</code></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source key</dt>
          <dd><code>{kit.sourceKey}</code></dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Shared secret</dt>
          <dd><code className="break-all">{kit.secret}</code></dd>
        </div>
      </dl>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-background/60 p-2 text-[10.5px] leading-relaxed ring-1 ring-border/40">
        {text}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 text-[11.5px]"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            toast.success("Spoke credentials copied.");
          }}
        >
          <Copy className="h-3 w-3" /> Copy the whole kit
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11.5px]" onClick={onDone}>
          I stored it — hide
        </Button>
      </div>
    </div>
  );
}
