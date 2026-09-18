import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { HOME_ADDRESS, installBlockedHere } from "@/lib/pwaInstall";
import { vantaToast as toast } from "@/lib/vantaVoice";

/**
 * One button, not a manual.
 *
 * Doctrine:
 *   - The common case is a tap: the phone's own install prompt, nothing to read.
 *   - Apple gives no button at all, so that case is one sentence, not a list.
 *   - A door that cannot open is said in one line instead of drawn as a dead
 *     button. The per-phone steps live at /install for whoever wants them.
 */
export function InstallVantaSection({ alwaysShow = false }: { alwaysShow?: boolean } = {}) {
  const { platform, installed, canPrompt, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const blocked = installBlockedHere();

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  const handleInstall = async () => {
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === "accepted") toast.success("Installing. Check your home screen.");
    else if (r === "dismissed") toast("No problem — the button stays here.");
    else toast("This browser did not offer the install prompt. Chrome on Android does.");
  };

  if (standalone && !installed && !alwaysShow) return null;

  const ios = platform === "ios-safari" || platform === "ios-other";

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <h2 className="text-sm font-semibold">Install Metro Echo</h2>

      <div className="mt-3">
        {installed ? (
          <p className="text-[12px] text-muted-foreground">
            Already installed — you are in the app window right now.
          </p>
        ) : blocked ? (
          <>
            <Button size="lg" className="w-full gap-2" asChild>
              <a href={`https://${HOME_ADDRESS}/?surface=settings`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open {HOME_ADDRESS}
              </a>
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A phone only installs from the real address, not this window.
            </p>
          </>
        ) : ios ? (
          <p className="text-[12px] text-muted-foreground">
            On iPhone: Safari's Share button, then <span className="text-foreground">Add to Home Screen</span>. Apple
            gives no one-tap button.
          </p>
        ) : canPrompt ? (
          <Button size="lg" className="w-full gap-2" onClick={handleInstall} disabled={busy}>
            <Download className="h-4 w-4" />
            Install app
          </Button>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Your browser has not offered its install prompt yet. In Chrome, the menu's{" "}
            <span className="text-foreground">Install app</span> does the same thing.
          </p>
        )}
      </div>

      {!alwaysShow && (
        <Link to="/install" className="vanta-focus mt-3 inline-block text-[11px] text-muted-foreground underline">
          Having trouble?
        </Link>
      )}
    </section>
  );
}
