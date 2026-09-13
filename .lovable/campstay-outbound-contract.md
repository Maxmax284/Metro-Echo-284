# Camp State (CampStay) → Metro Echo write contract

Inbound already works: Camp State posts signed events, Echo decides whether they
matter, nothing executes off the wire. This document is the missing half — the
one endpoint Camp State must expose so an **approved** change in Metro Echo can
actually land, and be provable afterwards.

Metro Echo's side is built (`supabase/functions/_shared/firstPartyWrite.ts`,
executor kind `first_party`). Until the endpoint below exists and the three
secrets are set, Echo says the connection can receive updates but cannot make
changes. It never pretends otherwise.

## Flow (unchanged spine)

```text
Ask / Today / Work proposes
  → action staged (status = staged)
  → person approves          (status = approved)
  → actions-execute calls the endpoint below
  → Camp State confirms with its own id
  → receipt written (execute.success / execute.failed)
```

No background writes. No path that skips approval. One action = one write =
one receipt.

## Endpoint Camp State must expose

`POST <GTH_WRITE_URL>`

### Headers Echo sends

| Header | Meaning |
|---|---|
| `X-Vanta-Signature` | HMAC-SHA256 hex over `${timestamp}.${rawBody}` using the shared secret — same scheme Camp State already verifies inbound |
| `X-Vanta-Timestamp` | Unix seconds; reject anything older than 5 minutes |
| `Idempotency-Key` | `action:<uuid>`; a repeat of the same key must return the **same** result, not a second change |
| `Authorization` | `Bearer <token>` when a token is configured |

### Body

```json
{
  "version": 1,
  "source": "metro_echo",
  "operation": "booking.update",
  "subject_id": "camp-state-booking-id",
  "fields": { "checkout": "2026-09-20", "note": "guest asked to extend" },
  "idempotency_key": "action:0f2c...",
  "action_id": "0f2c...",
  "approved": true,
  "sent_at": "1789..."
}
```

Allowed `operation` values (Echo will send nothing else):
`booking.update`, `booking.cancel`, `guest_message.send`, `note.create`,
`task.create`.

### Response Camp State must return

```json
{
  "ok": true,
  "id": "camp-state-record-id",
  "state": "extended",
  "confirmed_at": "2026-09-13T12:40:00Z",
  "detail": { "nights": 3 }
}
```

Rules Echo enforces on the answer:

- `ok: true` **and** a non-empty `id` — otherwise the action fails and the
  receipt reads "the other side did not confirm the change".
- `state` is Camp State's own word for where the record now stands; it goes on
  the receipt verbatim.
- Non-2xx, unreachable, or a vague 200 → failed receipt, nothing marked done.

### Errors

```json
{ "ok": false, "error": "booking is already cancelled" }
```

Return 4xx for "never going to work" and 5xx for "try again". Echo does not
retry writes automatically — a person decides whether to send it again.

## Secrets to set once the endpoint exists

| Secret | Value |
|---|---|
| `GTH_WRITE_URL` | Full URL of the endpoint above |
| `GTH_WRITE_SECRET` | Shared HMAC secret (may match the inbound one or be separate) |
| `GTH_WRITE_TOKEN` | Optional bearer token |

CampCore and Fenrir Lock plug into the identical contract with
`CAMPCORE_WRITE_*` / `FENRIR_WRITE_*`. No second adapter, no per-product code.

## Still needed from Camp State for per-user account linking

Separate from writes. Account linking ("Connect Camp State → sign in → done")
needs three endpoints Camp State does not have today:

1. `GET /oauth/authorize` — redirect the person, return an authorization code.
2. `POST /oauth/token` — exchange code for access + refresh tokens, with scopes.
3. `GET /me` — identify the account so Echo can map it to the right workspace.

Until those exist, the system-level signed webhook path stays as-is and nothing
is removed.
