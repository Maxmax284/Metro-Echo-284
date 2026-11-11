// Metro Echo service worker — push delivery only.
// No caching, no offline strategy in this pass. Capture-never-executes still applies:
// the SW shows the notification; tapping it deep-links into the platform where the user
// approves any action. The SW does not call APIs or mutate data on its own.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Metro Echo", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Metro Echo";
  // Low-consequence actions only. Nothing here approves, sends, buys or cancels:
  // a tap carries a status back into the platform, where the person decides.
  const allowed = ["view", "later", "got_it", "review", "stop_watching"];
  const actions = (payload.actions || [])
    .filter((a) => a && allowed.includes(a.action))
    .slice(0, 3)
    .map((a) => ({ action: a.action, title: a.title || a.action }));

  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    // Android draws `badge` in the status bar and it must be a monochrome
    // alpha mask — a full-colour icon there flattens to a white blob.
    badge: "/badge-monochrome.png",
    tag: payload.tag || "metro-echo",
    data: { url: payload.url || "/", ...(payload.data || {}) },
    actions,
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// A tapped action never mutates anything from the service worker. It opens the
// exact situation with the status it carries, and the platform applies it once
// the signed-in session is there to stand behind it.
const ACTION_STATUS = {
  view: "seen",
  review: "seen",
  later: "snoozed",
  got_it: "acted",
  stop_watching: "muted",
};

function situationUrl(notification, action) {
  const data = notification.data || {};
  const base = data.url || "/";
  const status = ACTION_STATUS[action];
  if (!status || !data.dedupeKey) return base;
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}ack=${encodeURIComponent(data.dedupeKey)}&as=${encodeURIComponent(status)}`;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = situationUrl(event.notification, event.action);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// ---- PWA share target ------------------------------------------------------
// Receives shared files/text from the OS share sheet. Stashes the payload in a
// dedicated Cache keyed by a one-shot id, then redirects the user into the
// platform with ?shared=<id>. The client reads + clears the cache and feeds the
// files into the normal staged-upload flow. Doctrine: capture only — no AI,
// no auto-ingest, the user still taps "Ingest" in the platform.
const SHARED_CACHE = "vanta-shared-inbox-v1";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const id = (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const cache = await caches.open(SHARED_CACHE);

    const meta = {
      id,
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
      receivedAt: Date.now(),
      files: [],
    };

    const files = form.getAll("files");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f || typeof f === "string") continue;
      const cacheKey = `/__shared/${id}/${i}`;
      const headers = new Headers();
      if (f.type) headers.set("Content-Type", f.type);
      headers.set("X-Vanta-Filename", encodeURIComponent(f.name || `file-${i}`));
      await cache.put(new Request(cacheKey), new Response(f, { headers }));
      meta.files.push({
        cacheKey,
        name: f.name || `file-${i}`,
        type: f.type || "",
        size: f.size || 0,
      });
    }

    await cache.put(
      new Request(`/__shared/${id}/_meta`),
      new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
    );

    return Response.redirect(`/?shared=${encodeURIComponent(id)}`, 303);
  } catch (e) {
    return Response.redirect(`/?shared_error=1`, 303);
  }
}

