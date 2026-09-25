import { Link } from "react-router-dom";
import { ArrowLeft, Smartphone, Apple } from "lucide-react";
import { InstallVantaSection } from "@/components/settings/InstallVantaSection";
import { HOME_ADDRESS, installBlockedHere } from "@/lib/pwaInstall";

/**
 * One address for "put this on my phone". The platform-aware door lives in
 * InstallVantaSection; this page always shows both sets of steps underneath so
 * nobody has to guess what their own phone does.
 */
export default function InstallApp() {
  const blocked = installBlockedHere();

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Link
          to="/settings"
          aria-label="Back to Control Room"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">Put Metro Echo on your phone</h1>
          <p className="truncate text-xs text-muted-foreground">Home screen icon, own window, same account.</p>
        </div>
      </header>

      <InstallVantaSection alwaysShow />

      <PushPrompt className="mt-4" />

      <section className="mt-6 space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Steps by phone</h2>

        <div className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">Android (Chrome)</div>
          </div>
          <ol className="mt-2 space-y-1 list-decimal pl-5 text-[12px] text-muted-foreground">
            <li>
              Open <span className="text-foreground">{HOME_ADDRESS}</span> in Chrome.
            </li>
            <li>Tap the button above, or the three dots in the top right.</li>
            <li>
              Choose <span className="text-foreground">Install app</span> or{" "}
              <span className="text-foreground">Add to Home screen</span>.
            </li>
            <li>Confirm. The icon lands in your app drawer.</li>
          </ol>
        </div>

        <div className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
          <div className="flex items-center gap-2">
            <Apple className="h-4 w-4 text-foreground/80" />
            <div className="text-sm font-medium">iPhone or iPad (Safari)</div>
          </div>
          <ol className="mt-2 space-y-1 list-decimal pl-5 text-[12px] text-muted-foreground">
            <li>
              Open <span className="text-foreground">{HOME_ADDRESS}</span> in Safari — not Chrome.
            </li>
            <li>Tap the Share button (square with an arrow).</li>
            <li>
              Scroll and choose <span className="text-foreground">Add to Home Screen</span>.
            </li>
            <li>
              Tap <span className="text-foreground">Add</span>.
            </li>
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Apple has no one-tap install, so there is no button to press here — only Safari's share sheet.
          </p>
        </div>

        <div className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
          <div className="text-sm font-medium">Want a downloadable Android file?</div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            The installed version above is the real app on Android: own icon, own window, offline-capable, and it updates
            itself. A separate downloadable file for the Play Store has to be built on a computer with Android Studio —
            Metro Echo is already set up for it, but the file itself cannot be produced from inside Metro Echo.
          </p>
        </div>

        {blocked && (
          <p className="text-[11px] text-muted-foreground">
            You are reading this inside a temporary window, so a phone cannot install from here. Open{" "}
            <a
              href={`https://${HOME_ADDRESS}/install`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline"
            >
              {HOME_ADDRESS}/install
            </a>{" "}
            on the phone you want the icon on.
          </p>
        )}
      </section>
    </div>
  );
}
