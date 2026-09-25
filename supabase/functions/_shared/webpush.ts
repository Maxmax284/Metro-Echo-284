// Minimal Web Push (RFC 8030 + VAPID) sender for Deno.
// Encrypts payload (aes128gcm) and POSTs to the subscription endpoint with VAPID auth.
// Intentionally dependency-free.

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, data);
  return new Uint8Array(sig);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, len);
}

// Import a raw 65-byte uncompressed P-256 public key.
async function importP256Public(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

// Convert PKCS#8 (from generateKey) into raw 32-byte private scalar — not needed because we use the ephemeral CryptoKey directly.

async function exportRawPublic(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function ecdhDerive(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  return new Uint8Array(bits);
}

// VAPID JWT signing using ES256 (P-256). Accepts a base64url-encoded raw 32-byte private key (standard VAPID key format).
async function signVapidJWT(audience: string, subject: string, privateKeyB64Url: string, publicKeyB64Url: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject.startsWith("mailto:") || subject.startsWith("https://") ? subject : `mailto:${subject}`,
  };
  const enc = new TextEncoder();
  const segs = [
    b64urlEncode(enc.encode(JSON.stringify(header))),
    b64urlEncode(enc.encode(JSON.stringify(payload))),
  ];
  const unsigned = segs.join(".");

  // Build JWK from raw VAPID keys to import as a signing CryptoKey.
  const pubRaw = b64urlDecode(publicKeyB64Url);
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error("VAPID public key must be 65-byte uncompressed P-256");
  }
  const x = b64urlEncode(pubRaw.slice(1, 33));
  const y = b64urlEncode(pubRaw.slice(33, 65));
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256", x, y, d: privateKeyB64Url, ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `${unsigned}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function encryptPayloadAes128Gcm(
  payload: Uint8Array,
  uaPublicRaw: Uint8Array, // 65 bytes
  authSecret: Uint8Array,  // 16 bytes
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicRaw: Uint8Array }> {
  // Generate ephemeral ECDH key pair.
  const ephem = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicRaw = await exportRawPublic(ephem.publicKey);

  const uaPublicKey = await importP256Public(uaPublicRaw);
  const ecdhSecret = await ecdhDerive(ephem.privateKey, uaPublicKey);

  // PRK_key = HKDF(auth, ecdhSecret, "WebPush: info\0" || ua_public || server_public, 32)
  const infoKey = concat(
    new TextEncoder().encode("WebPush: info\0"),
    uaPublicRaw,
    serverPublicRaw,
  );
  const IKM = await hkdf(authSecret, ecdhSecret, infoKey, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, IKM, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, IKM, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // Pad: payload + 0x02 (last record delimiter for aes128gcm).
  const padded = concat(payload, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  // aes128gcm content coding header (RFC 8188 §2.1):
  // salt (16) || rs (4, big-endian) || idlen (1) || keyid (idlen bytes) || ciphertext
  // The keyid MUST carry the ephemeral server public key — the receiver derives the
  // ECDH secret from it. Omitting it leaves the payload undecryptable and the push
  // service silently drops the notification after accepting it.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([serverPublicRaw.length]), serverPublicRaw);
  const ciphertext = concat(header, ct);

  return { ciphertext, salt, serverPublicRaw };
}

export interface SendPushResult {
  ok: boolean;
  status: number;
  error?: string;
  shouldDelete?: boolean; // 404/410 = subscription gone
}

export async function sendWebPush(
  sub: Subscription,
  payload: object,
  opts: { vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string; ttl?: number },
): Promise<SendPushResult> {
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await signVapidJWT(audience, opts.vapidSubject, opts.vapidPrivateKey, opts.vapidPublicKey);

    const uaPublic = b64urlDecode(sub.p256dh);
    const auth = b64urlDecode(sub.auth);
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const { ciphertext } = await encryptPayloadAes128Gcm(body, uaPublic, auth);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${opts.vapidPublicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": String(opts.ttl ?? 60),
        "Urgency": "high",
      },
      body: ciphertext,
    });

    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    const shouldDelete = res.status === 404 || res.status === 410;
    return { ok: false, status: res.status, error: text.slice(0, 200), shouldDelete };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "send failed" };
  }
}
