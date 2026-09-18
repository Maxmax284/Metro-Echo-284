import { useState } from "react";
import { Download, ExternalLink, Share } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { HOME_ADDRESS, installBlockedHere } from "@/lib/pwaInstall";
import { vantaToast as toast } from "@/lib/vantaVoice";

/**
 * The front-door flyer. Same one-tap doctrine as the Control Room card:
 * a real button where the phone offers one, one sentence on iPhone, and
 * nothing at all where no install can happen (preview windows, already
 * installed). It never becomes a manual.
 */
export function InstallFlyer({ className = "" }: { className?: string }) {
  const { platform, installed, canPrompt, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const blocked = installBlockedHere();

  if (installed || gone) return null;

  const ios = platform === "ios-safari" || platform === "ios-other";

  const handleInstall = async () => {
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === "accepted") {
      toast.success("Installing. Check your home screen.");
      setGone(true);
    } else if (r === "dismissed") {
      toast("No problem — it stays available in Settings.");
    }
  };

  return (
    <div className={`rounded-2xl glass p-4 ring-1 ring-border/60 ${className}`}>
      {blocked ? (
        <>
          <p className="mb-3 text-[12px] text-muted-foreground">Install Metro Echo on this device.</p>
          <Button size="lg" className="w-full gap-2" asChild>
            <a href={`https://${HOME_ADDRESS}/install`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open to install
            </a>
          </Button>
        </>
      ) : ios ? (
        <div className="flex items-start gap-3">
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-[12px] text-muted-foreground">
            Keep Metro Echo on your home screen: Safari's Share button, then{" "}
            <span className="text-foreground">Add to Home Screen</span>.
          </p>
        </div>
      ) : canPrompt ? (
        <>
          <p className="mb-3 text-[12px] text-muted-foreground">Keep Metro Echo on your home screen.</p>
          <Button size="lg" className="w-full gap-2" onClick={handleInstall} disabled={busy}>
            <Download className="h-4 w-4" />
            Install app
          </Button>
        </>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-muted-foreground">Install Metro Echo on this device.</p>
          <Button size="lg" className="w-full gap-2" asChild>
            <Link to="/install">
              <Download className="h-4 w-4" />
              Install app
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
