// Plaid's own consent window, loaded only when the person asks for it.
//
// Doctrine: the bank's login belongs to the bank. Echo never asks for banking
// credentials itself and never renders a fake login — Plaid's window handles it,
// and Echo only receives permission to read.
const SDK = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

declare global {
  interface Window {
    Plaid?: {
      create: (config: Record<string, unknown>) => { open: () => void; exit: () => void; destroy: () => void };
    };
  }
}

let loading: Promise<void> | null = null;

export function loadPlaid(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no browser"));
  if (window.Plaid) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Plaid's window could not be loaded."));
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Plaid, resolving with the permission it hands back, or null if closed. */
export async function openPlaid(
  token: string,
): Promise<{ publicToken: string; institutionName: string | null } | null> {
  await loadPlaid();
  if (!window.Plaid) throw new Error("Plaid's window is unavailable.");
  return new Promise((resolve, reject) => {
    const handler = window.Plaid!.create({
      token,
      onSuccess: (publicToken: string, metadata: any) => {
        resolve({ publicToken, institutionName: metadata?.institution?.name ?? null });
        handler.destroy();
      },
      onExit: (err: any) => {
        handler.destroy();
        if (err) reject(new Error(err.display_message || err.error_message || "The bank window closed early."));
        else resolve(null);
      },
    });
    handler.open();
  });
}
