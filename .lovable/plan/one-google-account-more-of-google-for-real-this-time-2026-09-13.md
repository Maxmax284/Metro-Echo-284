# One Google account, more of Google — for real this time

Google is already one card with one sign-in. Calendar is genuinely wired. This pass adds
Gmail and Drive as real, separately-granted permissions on that same card, removes
Contacts because it cannot be honestly built, and then proves the whole loop live:
a real event, a real watch, a real change, a real receipt.

## First, an honesty fix

Right now the Google card decides you are "signed in" from whether *any* Google write
path exists — including the builder's own workspace connection. Nobody in this project
has actually linked their own Google account yet, and the card would still say Connected.
That gets fixed first: the card reads your own connection, per service, or it says
Available. No borrowed status.

## Gmail — read and notice, then a canvas you control

- Sign in once on the Google card, tap Gmail, grant reading. Nothing else changes.
- Echo reads what matters: unread, addressed to you, replies to threads you are already
  in. It surfaces one conclusion on Today ("Two of these are waiting on you"), never a
  card per email.
- Open one and there is a reply canvas: Echo drafts a starting point, you write over it,
  it is your words that go out.
- Sending is a **separate permission**, asked for the first time you actually try to
  send, and every send is an approval with a receipt. Reading never implies sending.
- In Telegram you can start a reply by talking, and Echo holds it as a draft — then it
  says finish it on the platform, where you can see the whole thread and the exact text
  before it leaves. No email is ever sent from a chat message alone.

## Drive — find first, read only when you say so

- Searching your Drive returns names, folders and dates. That is metadata, not content.
- Reading the inside of a file is a separate, per-file yes: "Open it in Google" or
  "Let Echo read it." Whichever you pick is recorded.
- A file Echo read gets filed under a project through the same intake everything else
  uses. No silent hoovering of your Drive.

## Contacts — off the list

There is no supported route to Google Contacts, so it comes off the card entirely
rather than sitting there as a button that cannot work. Typing an email address still
works everywhere it did before. Tasks stays listed as not built, honestly.

## Then the live proof

1. Sign in with Google on the card. Confirm Calendar reads Connected, Gmail and Drive
   read Available, and nothing claims to be on that isn't.
2. Grant Gmail. Confirm real mail appears as one conclusion, and a draft reply can be
   written and approved.
3. Grant Drive. Search for a real file, confirm reading it needs its own yes.
4. Create a real calendar event, tell Echo to keep an eye on it, change the time, wait
   for the background sweep, and confirm the outcome reads in plain time on Work plus a
   receipt in Receipts.
5. All of it at 384px on the phone, then desktop.

## What needs a tap from you

Gmail and Drive each need their connection approved once — I will surface those approval
cards during the build. Same Google account behind all three; the tap is what makes the
permission real instead of assumed.

## Technical notes

- Extend `_shared/appUserScopes.ts` from calendar-only to a per-connector map:
  `google_calendar`, `google_mail` (`gmail.readonly`, later `gmail.send`), `google_drive`
  (`drive.readonly`, `drive.metadata.readonly`). Generalise `app-user-oauth-start` /
  `app-user-oauth-complete` and the return route to take a `connectorId` instead of
  hardcoding calendar; reuse `appUserConnections` encrypted storage as-is.
- New `google-account-status` function: for the signed-in user only, reports per-connector
  connection presence plus last error. `GoogleAccountSection` reads it instead of
  inferring `signedIn` from `calendar-write-status`; workspace fallback stays for calendar
  reads but never renders as the person's own connection.
- New edge functions: `gmail-read` (list + batch metadata via
  `connector-gateway.lovable.dev/google_mail/gmail/v1`, bodies only on open),
  `gmail-draft` (draft only; send goes through the existing action spine with
  `executor_kind` reuse and an approval gate), `drive-search` (metadata),
  `drive-read` (single file, requires an explicit per-file approval row and writes an
  audit event).
- Gmail/Drive signals enter through the existing Awareness judgment path — no second
  event pipeline, no notification per message.
- `googleEcosystem.ts`: drop `contacts`, flip `gmail`/`drive` to `wired: true` with
  their scopes, add a `grantable` notion so the card can offer per-service consent.
- Tests: scope map integrity, per-connector status truthfulness (workspace key must not
  read as connected), Gmail conclusion bundling, drive read-requires-approval, gmail send
  blocked without scope, and the calendar watch loop end to end.
