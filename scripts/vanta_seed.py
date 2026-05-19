#!/usr/bin/env python3
"""Vanta E2E seed script — tagged, reversible, manifest-tracked.

Modes:
  dry-run   : Print every insert plan + verify tables exist.
  seed      : Insert seed rows, write manifest to /mnt/documents/vanta-e2e/seed-manifest.json
  teardown  : Delete every ID in manifest. Re-verify zero seeded rows remain.
  verify    : Read manifest, count surviving rows by table.

All seeded rows that support jsonb get a {seed: true, seed_run: <ts>} tag.
All seeded rows go into the manifest by table+id, which is the source of truth
for teardown — works even on tables without a metadata column.
"""
import json, os, sys, uuid
from datetime import datetime, timedelta, timezone
import psycopg2, psycopg2.extras

USER_ID = "761b9440-c013-4b5a-a77a-53d826cd4329"
OUT_DIR = "/mnt/documents/vanta-e2e"
MANIFEST = f"{OUT_DIR}/seed-manifest.json"
SEED_RUN = datetime.now(timezone.utc).isoformat()
SEED_TAG = {"seed": True, "seed_run": SEED_RUN, "seeder": "vanta_e2e_v1"}

os.makedirs(OUT_DIR, exist_ok=True)

def conn():
    return psycopg2.connect(
        host=os.environ["PGHOST"], port=os.environ["PGPORT"],
        user=os.environ["PGUSER"], password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"], sslmode=os.environ.get("PGSSLMODE","require"),
    )

# ───── Seed payloads ─────────────────────────────────────────────────────────
PLACES = [
    {"label":"[SEED] Lamai Muay Thai","country":"Thailand","region":"Surat Thani",
     "geo":{"lat":9.4720,"lon":100.0518,"source":"seed_valid_land","city":"Lamai"}},
    {"label":"[SEED] Lamai town","country":"Thailand","region":"Surat Thani",
     "geo":{"lat":9.4830,"lon":100.0480,"city":"Lamai"}},
    {"label":"[SEED] Koh Samui (island)","country":"Thailand","region":"Surat Thani",
     "geo":{"lat":9.5120,"lon":100.0136,"city":"Koh Samui"}},
    {"label":"[SEED] OFFSHORE bad pin","country":None,"region":None,
     "geo":{"lat":9.4500,"lon":100.2000,"source":"seed_offshore"}},
    {"label":"[SEED] Saved place — Chaweng","country":"Thailand","region":"Surat Thani",
     "geo":{"lat":9.5311,"lon":100.0617,"city":"Chaweng"}},
    {"label":"[SEED] Manual — Bangkok pin","country":"Thailand","region":"Bangkok",
     "geo":{"lat":13.7563,"lon":100.5018,"source":"manual_search"}},
]

NOTES = [
    ("[SEED] GroundStay launch checklist","Pre-launch: copy review, pricing tiers, waiver flow, support inbox.",["project","groundstay"]),
    ("[SEED] Nikki — operating context","Runs Lamai Muay Thai. WhatsApp-first. Travels constantly. Needs zero friction.",["person","nikki"]),
    ("[SEED] Lamai — printer hours","The print shop near 7-Eleven closes ~5pm. Confirmed by passing today.",["place","lamai","field-note"]),
    ("[SEED] Visa appointment doc","Need passport, bank letter, photo. Submit by Tue.",["document","admin"]),
    ("[SEED] Field note — beach road","Beach road flooded near soi 5 after rain. Avoid 4-7pm.",["field-note","lamai"]),
    ("[SEED] Decision — single Telegram bot","One bot per platform, not per persona. Cuts confusion.",["decision","telegram"]),
    ("[SEED] Idea — daily 9am brief","Auto-summary at 9am: open commitments, today's reminders, weather, anomalies.",["idea","companion"]),
    ("[SEED] Pre-reminder — pay rent","Rent due Friday. Set reminder Thursday morning.",["reminder-seed"]),
]

COMMITMENTS = [
    ("[SEED] Send GroundStay update to Nikki tonight",  +6, "high"),
    ("[SEED] Check booking issue at Lamai Muay Thai",   +24, "normal"),
    ("[SEED] Follow up with vendor on invoice #4421",   +48, "normal"),
    ("[SEED] Confirm schedule change before tomorrow",  +14, "high"),
]

NUDGES = [  # title, body, hours_from_now
    ("[SEED] Pay rent",                      "Due Friday. Tap to mark done.",            24),
    ("[SEED] Message coach Tom",             "Reschedule pads session.",                  3),
    ("[SEED] Check dog food supply",         "Last bag opened Monday.",                   8),
    ("[SEED] Follow up with guest #G-227",   "Asked about late checkout.",                4),
    ("[SEED] Review tomorrow's schedule",    "5 sessions back-to-back.",                 18),
    ("[SEED] Prep visa doc before appt",     "Bring originals + copies.",                36),
]

FIELD_NOTES = [
    ("printer_hours",  "Print shop near 7-Eleven closes ~5pm",       "Lamai"),
    ("road_closure",   "Beach road floods 4-7pm after rain",          "Lamai"),
    ("vendor_price",   "Vendor invoice #4421 priced 15% over quote",  "Lamai"),
]

FILES = [
    ("receipt_seed.jpg",      "image/jpeg",        12000, "[SEED] receipt"),
    ("invoice_4421.pdf",      "application/pdf",   45000, "[SEED] invoice"),
    ("rental_contract.pdf",   "application/pdf",  120000, "[SEED] contract"),
    ("visa_doc.pdf",          "application/pdf",   60000, "[SEED] admin"),
    ("chat_screenshot.png",   "image/png",         95000, "[SEED] screenshot"),
]

ACTIONS = [
    ("[SEED] Draft reply to vendor #4421",          "proposed",            "standard"),
    ("[SEED] Send GroundStay update email",         "awaiting_approval",   "standard"),
    ("[SEED] Archived test action",                 "executed",            "standard"),
]

# Mocked Telegram captures — recorded into audit_log + a note so the routing
# path is visible without any real bot call.
TELEGRAM_MOCKS = [
    ("note",       "Need to remember the printer shop near Lamai closes early."),
    ("commitment", "I told Nikki I'd send the GroundStay update tonight."),
    ("reminder",   "Remind me to check dog food before evening."),
    ("correction", "No, that place is Lamai, not offshore."),
    ("ambiguous",  "Maybe drop by gym later if time."),
    ("action",     "Send the vendor a reminder about invoice 4421."),
]

INVESTIGATIONS = [
    ("[SEED] Vendor pricing conflict — is the invoice right?", "Findings show 15% over quote, vendor cited 'rush surcharge' but quote had no rush clause."),
    ("[SEED] Awareness source conflict — Lamai vs offshore", "GPS reported offshore pin, but saved place + reverse geocode disagree. Saved place wins."),
]

# ───── Helpers ──────────────────────────────────────────────────────────────
def tag(extra=None):
    d = dict(SEED_TAG)
    if extra: d.update(extra)
    return json.dumps(d)

def dry_run():
    print("=== DRY RUN ===")
    print(f"User: {USER_ID}")
    print(f"Seed run: {SEED_RUN}\n")
    plan = {
        "awareness_places": len(PLACES),
        "notes": len(NOTES),
        "commitments": len(COMMITMENTS),
        "nudges": len(NUDGES),
        "field_notes": len(FIELD_NOTES),
        "ingested_files": len(FILES),
        "actions": len(ACTIONS),
        "investigations": len(INVESTIGATIONS),
        "investigation_findings": len(INVESTIGATIONS) * 2,
        "audit_log (mock telegram + every insert)": len(TELEGRAM_MOCKS) + sum([
            len(PLACES),len(NOTES),len(COMMITMENTS),len(NUDGES),len(FIELD_NOTES),
            len(FILES),len(ACTIONS),len(INVESTIGATIONS)]),
        "notes (mock telegram capture)": len(TELEGRAM_MOCKS),
    }
    print("Rows to insert per table:")
    for t, n in plan.items():
        print(f"  {t:<55s} {n}")
    print("\nTagging strategy:")
    print("  - notes/actions/commitments/audit_log/field_notes : jsonb {seed:true,...}")
    print("  - all others (no jsonb): label/title prefixed with '[SEED]'")
    print("  - EVERY inserted id written to manifest -> bulletproof teardown")

    # Verify tables exist
    c = conn(); cur = c.cursor()
    cur.execute("""
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY(%s)
      ORDER BY table_name
    """, (list(plan.keys()).__add__ if False else [
        "awareness_places","notes","commitments","nudges","field_notes",
        "ingested_files","actions","investigations","investigation_findings","audit_log"
    ],))
    found = {r[0] for r in cur.fetchall()}
    expected = {"awareness_places","notes","commitments","nudges","field_notes",
                "ingested_files","actions","investigations","investigation_findings","audit_log"}
    missing = expected - found
    print(f"\nTable check: {len(found)}/{len(expected)} present")
    if missing: print(f"  MISSING: {missing}")
    else: print("  All target tables present.")
    cur.close(); c.close()
    return 0 if not missing else 1

def seed():
    c = conn(); cur = c.cursor()
    manifest = {"seed_run": SEED_RUN, "user_id": USER_ID, "ids": {}}
    def track(table, _id):
        manifest["ids"].setdefault(table, []).append(str(_id))

    # awareness_places
    for p in PLACES:
        cur.execute("""INSERT INTO awareness_places (user_id,label,country,region,geo)
                       VALUES (%s,%s,%s,%s,%s::jsonb) RETURNING id""",
                    (USER_ID, p["label"], p["country"], p["region"], json.dumps(p["geo"])))
        track("awareness_places", cur.fetchone()[0])

    # notes
    note_ids = []
    for title, body, tags in NOTES:
        cur.execute("""INSERT INTO notes (user_id,title,body,tags,metadata)
                       VALUES (%s,%s,%s,%s,%s::jsonb) RETURNING id""",
                    (USER_ID, title, body, tags, tag()))
        nid = cur.fetchone()[0]; note_ids.append(nid); track("notes", nid)

    # commitments
    for summary, hours, prio in COMMITMENTS:
        due = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
        cur.execute("""INSERT INTO commitments (user_id,summary,due_at,priority,status)
                       VALUES (%s,%s,%s,%s,'open') RETURNING id""",
                    (USER_ID, summary, due, prio))
        track("commitments", cur.fetchone()[0])

    # nudges
    for title, body, hours in NUDGES:
        exp = (datetime.now(timezone.utc) + timedelta(hours=hours+72)).isoformat()
        cur.execute("""INSERT INTO nudges (user_id,kind,title,body,status,expires_at)
                       VALUES (%s,'reminder',%s,%s,'pending',%s) RETURNING id""",
                    (USER_ID, title, body, exp))
        track("nudges", cur.fetchone()[0])

    # field_notes (has metadata? -> share_intent etc; no metadata col)
    for nt, summary, loc in FIELD_NOTES:
        cur.execute("""INSERT INTO field_notes (user_id,note_type,summary,location_label,
                                                share_intent,freshness,confidence,status)
                       VALUES (%s,%s,%s,%s,'private_only','live','medium','active') RETURNING id""",
                    (USER_ID, nt, "[SEED] "+summary, loc))
        track("field_notes", cur.fetchone()[0])

    # ingested_files (metadata jsonb)
    for fn, mime, size, _ in FILES:
        cur.execute("""INSERT INTO ingested_files (user_id,filename,mime_type,size_bytes,
                                                   source,status,metadata)
                       VALUES (%s,%s,%s,%s,'upload','pending',%s::jsonb) RETURNING id""",
                    (USER_ID, fn, mime, size, tag()))
        track("ingested_files", cur.fetchone()[0])

    # actions
    for title, status, risk in ACTIONS:
        cur.execute("""INSERT INTO actions (user_id,title,description,status,risk,
                                            payload,source)
                       VALUES (%s,%s,%s,%s,%s,%s::jsonb,'seed') RETURNING id""",
                    (USER_ID, title, "Seeded for E2E test.", status, risk, tag()))
        track("actions", cur.fetchone()[0])

    # investigations + findings
    for q, summary in INVESTIGATIONS:
        cur.execute("""INSERT INTO investigations (user_id,question,summary,status)
                       VALUES (%s,%s,%s,'complete') RETURNING id""",
                    (USER_ID, q, summary))
        inv_id = cur.fetchone()[0]; track("investigations", inv_id)
        for claim, conf in [("[SEED] supporting claim A","high"),("[SEED] counter claim B","medium")]:
            cur.execute("""INSERT INTO investigation_findings
                           (user_id,investigation_id,claim,confidence,source_kind)
                           VALUES (%s,%s,%s,%s,'seed') RETURNING id""",
                        (USER_ID, inv_id, claim, conf))
            track("investigation_findings", cur.fetchone()[0])

    # mocked telegram captures -> notes + audit_log
    for kind, text in TELEGRAM_MOCKS:
        cur.execute("""INSERT INTO notes (user_id,title,body,tags,metadata)
                       VALUES (%s,%s,%s,%s,%s::jsonb) RETURNING id""",
                    (USER_ID, f"[SEED] tg/{kind}", text, ["telegram","seed",kind],
                     tag({"telegram_mock":True,"classified_as":kind})))
        note_id = cur.fetchone()[0]; track("notes", note_id)
        cur.execute("""INSERT INTO audit_log (user_id,entity_type,entity_id,event,payload)
                       VALUES (%s,'note',%s,'telegram_capture',%s::jsonb) RETURNING id""",
                    (USER_ID, note_id, tag({"classified_as":kind,"raw":text})))
        track("audit_log", cur.fetchone()[0])

    # audit receipt for major surfaces
    for ev in ["seed_run_started","awareness_places_seeded","notes_seeded",
               "commitments_seeded","nudges_seeded","actions_seeded","seed_run_completed"]:
        cur.execute("""INSERT INTO audit_log (user_id,entity_type,event,payload)
                       VALUES (%s,'seed',%s,%s::jsonb) RETURNING id""",
                    (USER_ID, ev, tag()))
        track("audit_log", cur.fetchone()[0])

    c.commit(); cur.close(); c.close()
    with open(MANIFEST,"w") as f: json.dump(manifest, f, indent=2)
    total = sum(len(v) for v in manifest["ids"].values())
    print(f"Seeded {total} rows across {len(manifest['ids'])} tables.")
    print(f"Manifest: {MANIFEST}")
    return 0

def teardown():
    if not os.path.exists(MANIFEST):
        print(f"No manifest at {MANIFEST} — nothing to tear down."); return 0
    with open(MANIFEST) as f: m = json.load(f)
    # FK-safe order
    order = ["audit_log","investigation_findings","investigations","actions",
             "ingested_files","field_notes","nudges","commitments","notes",
             "awareness_places"]
    c = conn(); cur = c.cursor()
    deleted = {}
    for t in order:
        ids = m["ids"].get(t, [])
        if not ids: continue
        cur.execute(f"DELETE FROM {t} WHERE id = ANY(%s::uuid[]) AND user_id=%s",
                    (ids, USER_ID))
        deleted[t] = cur.rowcount
    c.commit(); cur.close(); c.close()
    print("Deleted:")
    for t,n in deleted.items(): print(f"  {t:<25s} {n}")
    # Verify zero seed survivors by tag/prefix
    return verify()

def verify():
    c = conn(); cur = c.cursor()
    checks = [
        ("notes (seed tag)", "SELECT count(*) FROM notes WHERE user_id=%s AND metadata->>'seed'='true'"),
        ("notes (SEED prefix)", "SELECT count(*) FROM notes WHERE user_id=%s AND title LIKE '[SEED]%%'"),
        ("commitments (SEED prefix)", "SELECT count(*) FROM commitments WHERE user_id=%s AND summary LIKE '[SEED]%%'"),
        ("nudges (SEED prefix)", "SELECT count(*) FROM nudges WHERE user_id=%s AND title LIKE '[SEED]%%'"),
        ("actions (seed tag)", "SELECT count(*) FROM actions WHERE user_id=%s AND payload->>'seed'='true'"),
        ("ingested_files (seed tag)", "SELECT count(*) FROM ingested_files WHERE user_id=%s AND metadata->>'seed'='true'"),
        ("awareness_places (SEED prefix)", "SELECT count(*) FROM awareness_places WHERE user_id=%s AND label LIKE '[SEED]%%'"),
        ("field_notes (SEED prefix)", "SELECT count(*) FROM field_notes WHERE user_id=%s AND summary LIKE '[SEED]%%'"),
        ("investigations (SEED prefix)", "SELECT count(*) FROM investigations WHERE user_id=%s AND question LIKE '[SEED]%%'"),
        ("audit_log (seed payload)", "SELECT count(*) FROM audit_log WHERE user_id=%s AND payload->>'seed'='true'"),
    ]
    total = 0
    print("Verification (seeded rows remaining):")
    for name, sql in checks:
        cur.execute(sql, (USER_ID,)); n = cur.fetchone()[0]; total += n
        print(f"  {name:<40s} {n}")
    cur.close(); c.close()
    print(f"TOTAL surviving seeded rows: {total}")
    return 0 if total == 0 else 2

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "dry-run"
    sys.exit({"dry-run": dry_run, "seed": seed, "teardown": teardown, "verify": verify}[mode]())
