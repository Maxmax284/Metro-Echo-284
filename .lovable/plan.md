# Work document engine: meeting notes to grounded drafts

## Outcome

Extend the existing Documents desk so a person can turn selected meeting notes and referenced Metro Echo receipts into one real, reviewable document draft.

The person chooses the output each time:

- **Meeting brief** — decisions, owners, dates, open questions, and evidence.
- **Follow-up memo** — a polished recap suitable for sharing after review.

When the draft is ready, **Today and Telegram show the same situation** with **Review** and **Open in Work** actions. Using either action clears that shared attention state everywhere without approving, sending, or sharing the document.

## What will be reused

- Existing `documents`, `document_versions`, draft/revision/approval flow, Documents desk, and document receipt timeline.
- Existing `notes` records for meeting notes; no new meeting-notes system.
- Existing `audit_log` rows as receipts and provenance; no second receipt engine.
- Existing `nudges`, `deliveries`, room signals, Telegram acknowledgement, and deep-link patterns.
- Existing Work room and Documents tile; no new room or dashboard.

## Build steps

### 1. Add a notes-and-receipts draft path

Add a “From meeting notes” choice to the existing New document flow.

The flow will:

1. Let the person choose a **Meeting brief** or **Follow-up memo**.
2. Show scope-safe notes, prioritizing conversation/meeting captures while still allowing another note to be selected deliberately.
3. Show recent, readable receipts from the same personal or workspace scope.
4. Require at least one note; receipts remain optional and explicitly selected.
5. Show the selected evidence before generation.

The existing legal/business templates remain unchanged.

### 2. Ground generation in server-resolved evidence

Extend the current draft request with note IDs and receipt IDs, not client-supplied evidence text.

The document function will:

- Verify the signed-in person and active scope.
- Fetch only permitted notes and audit receipts.
- Reject missing, mismatched, or inaccessible references.
- Label every evidence block with a stable source reference.
- Instruct Echo to use only supplied facts, mark gaps as `[to be supplied]`, and never invent attendees, decisions, owners, dates, or outcomes.
- Generate Markdown into the existing document-version flow.

The edited AI call will use the required `openai/gpt-6-astra` Responses API with streaming, reasoning enabled, no timer abort, and clear gateway errors. A real request will be tested before completion.

### 3. Preserve provenance without another evidence system

Store the selected source references in the existing document `draft_inputs` JSON and in the existing `document.draft_created` audit receipt payload.

Each generated draft will visibly list its source notes and referenced receipts. Opening a source will use the existing note/receipt destinations where available. Revisions retain the original evidence set unless the person explicitly changes it.

No new evidence table or parallel citation engine will be introduced for this pass.

### 4. Create one shared draft-ready situation

After successful generation, create one scoped `document_draft_ready` nudge tied to the document ID and route it through the existing delivery rail.

- **Today:** one concise draft-ready item.
- **Work:** the Documents tile and room signal point to the exact draft.
- **Telegram:** one message with **Review** and **Open in Work** links.
- **No duplicate interruption:** the existing delivery choice remains authoritative; surfaces may reveal the situation without creating additional alerts.

Draft generation failure will leave the input and evidence selection intact and show the real error. It will not create a ready signal.

### 5. Make Review and Open clear the same attention state

Add a document-specific acknowledgement helper that reuses the current nudge/delivery update rules.

- **Review** opens the exact draft in review context, then marks its nudge seen and its matching delivery acted.
- **Open in Work** opens Work at the Documents destination for that exact draft, then performs the same acknowledgement.
- Telegram buttons carry the document destination and the same stored nudge identity.
- Opening or reviewing does **not** approve, export, send, sign, or share anything.
- Approval remains an explicit separate action inside Metro Echo.

The stale document-awareness status vocabulary will be aligned with the real statuses (`drafted`, `reviewed`, `approved`) so old signals retire instead of lingering.

### 6. Exact navigation

Support an exact document deep link, preserving the four-room structure:

- Work signal → Work/Documents → exact draft.
- Today item → exact draft.
- Telegram **Review** / **Open in Work** → signed-in app → exact draft.
- Receipt timeline remains available inside the document.

No fifth room, document notification center, or separate drafting workspace.

## Interface behavior

- Mobile-first selection with large note/receipt rows and a compact selected-evidence summary.
- Plain labels: “Meeting brief,” “Follow-up memo,” “Notes used,” and “Receipts used.”
- Clear empty states explain how meeting notes get there.
- Existing Metro Echo card, type, color, motion, and reduced-motion rules remain authoritative.
- Motion is limited to the existing one-shot room signal/draft-ready behavior.

## Technical details

- Extend the current document types and `runDraft` payload with optional structured evidence references while preserving all existing template callers.
- Resolve evidence inside the document edge function with ownership and organization checks.
- Keep source snapshots bounded in size and identify truncated source text honestly.
- Store IDs, titles, timestamps, event names, and scope in existing JSON/audit payloads; never store private coordinates or unrelated receipt payload fields in the draft.
- Update Telegram link helpers to support an exact document destination and document-ready action labels.
- Fix awareness document state sets so `drafted` is waiting and `reviewed`/`approved` are settled.
- Use existing `metro:attention-changed` refresh behavior after acknowledgement.

## Tests and proof

### Automated

- Evidence selection and scope filtering.
- Meeting-brief and follow-up-memo prompt construction.
- Missing evidence, inaccessible evidence, and source truncation.
- No invented-fact contract in the server prompt.
- Existing template drafting remains unchanged.
- One nudge/delivery identity per finished draft.
- Review/Open acknowledgement clears Today, Work, and Telegram state.
- `drafted` raises the right waiting state; `reviewed`/`approved` retire it.
- Exact document deep links.
- Reduced-motion behavior.

### Live verification

1. Select a real meeting note and at least one real receipt.
2. Generate both draft formats in separate test documents.
3. Confirm the draft text is grounded and source references are visible.
4. Confirm Today, Work, and Telegram point to the same draft without duplicate alerts.
5. Use a Telegram **Review** or **Open in Work** action and confirm the Today/Work signal clears.
6. Confirm the document receipt records creation and acknowledgement.
7. Verify at 384px and 1440px with no overlap or horizontal overflow.
8. Confirm no action approves, exports, sends, or shares the draft.

## Rollback boundary

The meeting-notes entry path, evidence payload, document-ready nudge, and exact-document navigation remain additive. They can be removed without changing existing template drafts, uploaded-document review, exports, or the four-room shell.
