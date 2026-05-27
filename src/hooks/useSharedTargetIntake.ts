// useSharedTargetIntake — H2 PWA share target seam.
//
// When the OS share sheet sends files to Vanta, the service worker stashes
// the payload in a Cache and redirects to "/?shared=<id>". This hook runs on
// mount, drains that cache once, and hands the files to a caller-provided
// `onFiles` callback (typically staged.stage from useStagedUpload).
//
// Doctrine:
//  - Capture only. Files arrive staged; the user still taps "Ingest".
//  - One-shot: the cache entry is deleted as soon as it's read.
//  - Silent failure on unsupported browsers (Safari iOS, desktop SW gaps).
import { useEffect, useRef } from "react";

const SHARED_CACHE = "vanta-shared-inbox-v1";

type SharedMeta = {
  id: string;
  title: string;
  text: string;
  url: string;
  receivedAt: number;
  files: { cacheKey: string; name: string; type: string; size: number }[];
};

export function useSharedTargetIntake(
  onFiles: (files: File[], context: { title: string; text: string; url: string }) => void,
) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("shared");
    if (!id) return;
    if (!("caches" in window)) return;

    let cancelled = false;

    (async () => {
      try {
        const cache = await caches.open(SHARED_CACHE);
        const metaRes = await cache.match(`/__shared/${id}/_meta`);
        if (!metaRes) return;
        const meta = (await metaRes.json()) as SharedMeta;

        const files: File[] = [];
        for (const f of meta.files ?? []) {
          const res = await cache.match(f.cacheKey);
          if (!res) continue;
          const blob = await res.blob();
          files.push(new File([blob], f.name, { type: f.type || blob.type }));
          // best-effort cleanup per file
          await cache.delete(f.cacheKey).catch(() => {});
        }
        await cache.delete(`/__shared/${id}/_meta`).catch(() => {});

        // Clean the URL — don't leave ?shared= hanging in history.
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);

        if (cancelled) return;
        if (files.length > 0 || meta.text || meta.url) {
          onFiles(files, { title: meta.title, text: meta.text, url: meta.url });
        }
      } catch {
        // best-effort — never break the app over a share intake
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
