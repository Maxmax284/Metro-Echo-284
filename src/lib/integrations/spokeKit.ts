// Spoke credential kit — the paste-once bundle another platform needs to push
// signals into Vanta. Pure string building so it can be unit tested and so the
// secret never travels anywhere except the clipboard the owner asked for.

export type SpokeKitInput = {
  /** Human label, e.g. "LMT Camp State". */
  platformName: string;
  /** Canonical source key Vanta expects in the payload, e.g. "ground_truth_hub". */
  sourceKey: string;
  /** Full inbound webhook URL. */
  webhookUrl: string;
  /** Shared secret the spoke signs with. */
  secret: string;
};

/** A realistic notice.raised body — the universal event every spoke can send. */
export function sampleNoticePayload(input: SpokeKitInput): Record<string, unknown> {
  return {
    source_platform: input.sourceKey,
    event_type: "notice.raised",
    idempotency_key: `${input.sourceKey}-notice-0001`,
    occurred_at: "2026-01-01T09:00:00Z",
    payload: {
      severity: "warning",
      title: "Front desk flagged a late checkout",
      body: "Room 4 asked to stay until 3pm. Needs a call back.",
      reference: "BK-10482",
    },
  };
}

/**
 * Copy-paste instructions for the other platform's engineer (or for Maxwell
 * pasting into that platform's own settings). Notification only: the text says
 * plainly that nothing executes from an inbound signal.
 */
export function buildSpokeKit(input: SpokeKitInput): string {
  const body = JSON.stringify(sampleNoticePayload(input));
  return [
    `# ${input.platformName} → Vanta spoke credentials`,
    ``,
    `Webhook URL: ${input.webhookUrl}`,
    `Source key:  ${input.sourceKey}`,
    `Shared secret: ${input.secret}`,
    ``,
    `Signing: HMAC-SHA256 over "<unix_seconds>.<raw_body>" using the shared secret.`,
    `Send it hex-encoded in the header X-Vanta-Signature (a plain "sha256=" prefix is fine),`,
    `and the same unix seconds in X-Vanta-Timestamp.`,
    ``,
    `Example (bash):`,
    `TS=$(date +%s)`,
    `BODY='${body}'`,
    `SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac '${input.secret}' | awk '{print $2}')`,
    `curl -sS -X POST '${input.webhookUrl}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H "X-Vanta-Timestamp: $TS" \\`,
    `  -H "X-Vanta-Signature: sha256=$SIG" \\`,
    `  --data "$BODY"`,
    ``,
    `What happens next: the signal lands as a draft in Vanta and, if you have`,
    `proactive awareness on, it reaches you through Vanta's own delivery pipe.`,
    `Nothing executes from an inbound signal. Approval always happens in Vanta.`,
  ].join("\n");
}
