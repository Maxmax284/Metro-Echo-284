import { useState } from "react";
import { Download, Smartphone, Apple, Monitor, CheckCircle2, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { HOME_ADDRESS, installBlockedHere, isEmbeddedWindow } from "@/lib/pwaInstall";
import { vantaToast as toast } from "@/lib/vantaVoice";

export function InstallVantaSection({ alwaysShow = false }: { alwaysShow?: boolean } = {}) {
  const { platform, installed, canPrompt, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  // No prompt can appear in an embedded window or on a throwaway link.
  const blocked = installBlockedHere();

  // Doctrine: hide install CTA when already running standalone — no point yelling at a closed door.
  const standalone = typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  const handleInstall = async () => {
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === "accepted") toast.success("Metro Echo is installing. Check your home screen or app drawer.");
    else if (r === "dismissed") toast("No problem — you can install it later from Settings.");
    else toast("Install isn't available from this browser right now. Try opening Metro Echo in Chrome.");
  };

  if (standalone && !installed) {
    // Standalone signal trumps stale installed flag.
    return null;
  }

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/15 p-2 ring-1 ring-primary/30">
          <Download className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Install Metro Echo</h2>
          <p className="text-[12px] text-muted-foreground">Use Metro Echo like an app on this device.</p>
        </div>
      </div>

      <div className="mt-4">
        {installed ? (
          <InstalledCard />
        ) : blocked ? (
          /* No browser offers an install here, so offer the door that works. */
          <OpenRealAddressCard embedded={isEmbeddedWindow()} />
        ) : platform === "android-chromium" ? (
          <AndroidChromiumCard canPrompt={canPrompt} busy={busy} onInstall={handleInstall} />
        ) : platform === "android-other" ? (
          <SimpleHint icon={<Smartphone className="h-4 w-4" />} title="Open in Chrome to install">
            For the easiest one-tap install on Android, open Metro Echo in Chrome and come back to this screen.
          </SimpleHint>
        ) : platform === "ios-safari" ? (
          <IosSafariCard />
        ) : platform === "ios-other" ? (
          <SimpleHint icon={<Apple className="h-4 w-4" />} title="Open in Safari on iPhone">
            Apple does this through Safari. Open Metro Echo in Safari, then follow the Add to Home Screen steps.
          </SimpleHint>
        ) : platform === "desktop-chromium" ? (
          <DesktopCard canPrompt={canPrompt} busy={busy} onInstall={handleInstall} />
        ) : (
          <SimpleHint icon={<Info className="h-4 w-4" />} title="Install isn't ready from this browser">
            Your browser hasn't offered the install prompt yet. Try Chrome or Edge on desktop, or Chrome on Android.
          </SimpleHint>
        )}
      </div>

      {/* One warning is enough — the blocked card already says where to go. */}
      {!blocked && <AddressCard />}
      <CapabilitiesCard />
    </section>
  );
}


/**
 * Installing from a temporary preview link is how people end up with an app
 * icon pointing at an address that stops working. Say where the real one is.
 */
function AddressCard() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const onHome = host === HOME_ADDRESS;
  if (onHome) {
    return (
      <div className="mt-4 rounded-lg bg-background/30 p-3 ring-1 ring-border/40">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Address</div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          You're on <span className="text-foreground">{HOME_ADDRESS}</span> — the permanent one. Install from here.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
      <div className="text-[11px] uppercase tracking-wider text-amber-300">Install from the real address</div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        This window is a temporary link, so an icon added from here will break later. Open{" "}
        <a
          href={`https://${HOME_ADDRESS}/?surface=settings`}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          {HOME_ADDRESS}
        </a>{" "}
        and install from there instead. If you already added an old icon, delete it and add this one.
      </p>
    </div>
  );
}

function InstalledCard() {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-500/30">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
      <div className="text-xs">
        <div className="font-medium text-emerald-300">You're using Metro Echo in app mode.</div>
        <div className="text-muted-foreground">Open from your home screen next time for the full app feel.</div>
      </div>
    </div>
  );
}

function AndroidChromiumCard({ canPrompt, busy, onInstall }: { canPrompt: boolean; busy: boolean; onInstall: () => void }) {
  /* A greyed-out button reads as broken. When Chrome hasn't offered the prompt,
     show the menu route instead — it always works. */
  if (!canPrompt) {
    return (
      <div className="rounded-lg bg-background/40 p-3 ring-1 ring-border/60">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-foreground/70" />
          <div className="text-xs font-medium">Add it from the Chrome menu</div>
        </div>
        <ol className="mt-2 space-y-1 pl-5 text-[12px] text-muted-foreground list-decimal">
          <li>Tap the three dots at the top right of Chrome.</li>
          <li>Choose <span className="text-foreground">Add to Home screen</span>.</li>
          <li>Tap <span className="text-foreground">Install</span> or <span className="text-foreground">Add</span>.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Chrome hasn't offered its own one-tap button yet. This route does the same thing.
        </p>
      </div>
    );
  }
  return (
    <Button size="lg" className="w-full gap-2" onClick={onInstall} disabled={busy}>
      <Download className="h-4 w-4" />
      Install Metro Echo
    </Button>
  );
}

/**
 * The honest door. Inside an embedded window or on a throwaway link no browser
 * will ever offer an install, so the card stops pretending and opens the real
 * address in its own tab, where installing works.
 */
function OpenRealAddressCard({ embedded }: { embedded: boolean }) {
  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full gap-2" asChild>
        <a href={`https://${HOME_ADDRESS}/?surface=settings`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
          Open {HOME_ADDRESS}
        </a>
      </Button>
      <p className="text-[11px] text-muted-foreground">
        {embedded
          ? "You're looking at Metro Echo inside another app's window, so your phone can't install it from here. Open the real address in your browser, then install from there."
          : "This is a temporary link, so your phone won't install from it. Open the real address, then install from there."}
      </p>
    </div>
  );
}

function DesktopCard({ canPrompt, busy, onInstall }: { canPrompt: boolean; busy: boolean; onInstall: () => void }) {
  if (canPrompt) {
    return (
      <Button size="lg" className="w-full gap-2" onClick={onInstall} disabled={busy}>
        <Monitor className="h-4 w-4" />
        Install Metro Echo on this computer
      </Button>
    );
  }
  return (
    <SimpleHint icon={<Monitor className="h-4 w-4" />} title="Install from your browser menu">
      In Chrome or Edge, look for the install icon in the address bar, or open the browser menu and choose Install Metro Echo.
    </SimpleHint>
  );
}

function IosSafariCard() {
  return (
    <div className="rounded-lg bg-background/40 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <Apple className="h-4 w-4 text-foreground/70" />
        <div className="text-xs font-medium">Install on iPhone or iPad</div>
      </div>
      <ol className="mt-2 space-y-1 pl-5 text-[12px] text-muted-foreground list-decimal">
        <li>Tap the Share button in Safari.</li>
        <li>Choose <span className="text-foreground">Add to Home Screen</span>.</li>
        <li>Tap <span className="text-foreground">Add</span>.</li>
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground">Apple does this through Safari, not a one-tap prompt.</p>
    </div>
  );
}

function SimpleHint({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-background/40 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <span className="text-foreground/70">{icon}</span>
        <div className="text-xs font-medium">{title}</div>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{children}</p>
    </div>
  );
}

function CapabilitiesCard() {
  return (
    <div className="mt-4 rounded-lg bg-background/30 p-3 ring-1 ring-border/40">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">What installing does</div>
      <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
        <li>· Adds Metro Echo to your home screen or app drawer.</li>
        <li>· Opens in a clean standalone window — no browser chrome.</li>
        <li>· Faster launch into the core shell.</li>
        <li>· Camera, files, and location work where your browser allows them.</li>
        <li>· Deep links into Metro Echo surfaces still work.</li>
      </ul>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Honest limits</div>
      <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
        <li>· This is a PWA, not a full native app yet.</li>
        <li>· Offline shell and push notifications are coming later.</li>
        <li>· On iPhone, install runs through Safari's Add to Home Screen.</li>
      </ul>
    </div>
  );
}
