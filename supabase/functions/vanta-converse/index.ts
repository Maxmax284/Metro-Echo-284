import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// vanta-converse: streams a conversational response from Lovable AI Gateway,
// loads recent conversation context, and emits intent events for the client to apply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { COMPANION_VOICE, MEDIA_CAPABILITY } from "../_shared/vantaVoice.ts";
import { brandVoiceDirective, readBrandVoice } from "../_shared/brandVoice.ts";
import { bodyForDevice, depthDirective } from "../_shared/responseDepth.ts";
import { ROUTING_RULES, VOICE_RULES, STRUCTURE_RULES } from "../_shared/routingRules.ts";
import { createTurnReducer, iterResponsesEvents, postResponsesTurn } from "../_shared/responsesChat.ts";
import { buildWorkingContext, workingContextBlock } from "../_shared/workingContext.ts";
import { calendarContextBlock, type CalReadEvent } from "../_shared/calendarRead.ts";
import { abilitiesBlock, echoAbilities, matchAbilityQuestion } from "../_shared/echoAbilities.ts";
import { readAbilityFacts } from "../_shared/echoAbilityFacts.ts";
import { lifeBlock, lifeDomains, matchLifeQuestion } from "../_shared/streetSmart.ts";
import { judgmentBlock } from "../_shared/judgment/index.ts";
import { gatherJudgment } from "../_shared/judgment/gather.ts";
import { readLifeFacts } from "../_shared/lifeFacts.ts";
import {
  ECHO_READ_TOOLS,
  isEchoRead,
  readProvenance,
  readsBlock,
  runEchoRead,
  type EchoReadResult,
} from "../_shared/echoReads.ts";
import {
  routeRequest,
  sanitizeQuery,
  safeResearchLog,
  normalizeSource,
  rankSources,
  type PerceptionInput,
  type PerceptionInputKind,
  type RoutePlan,
  type SourceResult,
} from "../_shared/orchestration/index.ts";

/** What the composer tells us about each attachment. Never raw bytes. */
type AttachmentHint = {
  kind?: string | null;
  name?: string | null;
  readable?: boolean | null;
  ingested_file_id?: string | null;
};

const PERCEPTION_KIND: Record<string, PerceptionInputKind> = {
  image: "image",
  document: "document",
  audio: "audio",
  video: "file",
  other: "file",
  text: "text",
};

function perceptionInputs(hints: AttachmentHint[]): PerceptionInput[] {
  return hints.map((h) => ({
    kind: PERCEPTION_KIND[String(h.kind ?? "other")] ?? "file",
    ref: h.ingested_file_id ?? null,
    filename: h.name ?? null,
  }));
}

/** The plan is a directive, not a menu. It tells the model how to answer. */
function planBlock(plan: RoutePlan, hints: AttachmentHint[]): string {
  const unreadable = hints.filter((h) => h.readable === false).map((h) => h.name ?? "attachment");
  const lines = [
    "Answer plan for this turn (follow it; never describe it to the user):",
    `- methods: ${plan.capabilities.join(", ")}`,
    plan.perception.length ? `- perception jobs: ${plan.perception.join(", ")}` : "",
    plan.retrieval.length ? `- read from: ${plan.retrieval.join(", ")}` : "",
    plan.research ? `- external research: ${plan.research.intent} (${plan.research.depth})` : "- external research: none",
    `- state a conclusion only at confidence ${plan.min_confidence} or better; below that, say what you can see and what you cannot.`,
    plan.may_prepare_action
      ? "- you may stage a draft for approval. You never execute anything."
      : "- do not stage anything unless the user asked for it.",
    unreadable.length
      ? `- these attachments are kept but cannot be read yet: ${unreadable.join(", ")}. Say so plainly in one line; do not guess at their contents.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Quick external lookup, sanitized. Provider stays behind this seam. */
async function lookupSources(query: string, limit: number): Promise<SourceResult[]> {
  const key = Deno.env.get("SERPAPI_KEY") ?? "";
  if (!key) return [];
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("q", query);
  u.searchParams.set("engine", "google");
  u.searchParams.set("num", String(Math.min(limit, 6)));
  u.searchParams.set("api_key", key);
  const r = await fetch(u.toString());
  if (!r.ok) return [];
  const j = await r.json();
  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  const now = new Date();
  const out: SourceResult[] = [];
  for (const o of organic.slice(0, limit)) {
    const s = normalizeSource(
      { title: o?.title, url: o?.link, snippet: o?.snippet, provider: "serpapi" },
      { now },
    );
    if (s) out.push(s);
  }
  return rankSources(out);
}



const SYSTEM_PROMPT = `${COMPANION_VOICE}

You help with capture, planning, awareness, and staging actions. You CAN create
notes, set reminders, track commitments, stage actions for approval, run
Sherlock investigations, query awareness, read the user's schedule, and keep an
eye on something over time (keep_an_eye_on / stop_watching / whats_being_watched)
— all through your tools. A watch only looks and reports; it never writes or
executes, and it lives in Work under In motion. If a supported tool fits the request, call it.
You can also look in the person's own Gmail (search_mail) and their own Google Drive
(find_file) when they switched those on for themselves. Both are read only. Combine
them with the calendar into ONE answer about the situation, not one line per source.
If a service is not switched on, say that plainly — never invent what a message said.
When the answer lives outside all of that, you have two last resorts, in this order:
where_do_i_stand answers "where do I stand", "catch me up", "what actually needs me today" as
ONE compact read — waiting on you, open, moved, can wait, already handled — never a list per source.
When the answer lives outside all of that, you have two last resorts, in this order:
check_page for a page the person points at (a portal, a booking, a confirmation) and
look_up for a public fact with no page attached. Both only read. You cannot sign in,
submit a form, book, cancel or pay anywhere on the web — if a page needs a login, say
so and hand it back. Always say where an outside answer came from.
Anything happening now or recently — weather, flooding, strikes, outages, travel
disruption, news, today's prices — is a look_up, never a memory answer: what you
were trained on is stale for the present, so look it up and say when you did.

${MEDIA_CAPABILITY}

${ROUTING_RULES}

Additional in-app context:
- If recent file context is provided, use it as source material. Do not ask the
  user to paste the file again. If extraction failed or produced no text, say
  exactly that and name the file/status.

${VOICE_RULES}

${STRUCTURE_RULES}`;

/* Calendar changes are conversational here, exactly as they are on Telegram:
   say it in your own words, see the exact before/after, adjust it by talking,
   approve once. Nothing reaches the calendar without that approval. */
const CALENDAR_CHANGE_DIRECTIVE = `Changing the calendar by talking:
- The user can say it however they like ("push my dentist to Thursday morning", "book me and Dani Tuesday 6pm at One Loudoun", "cancel the Friday call"). Call stage_calendar_change with exact before/after values and their own words in event_reference.
- When they then adjust what you showed them ("actually 3:30", "make it Old Town instead", "lose the reminder"), call refine_calendar_change with the FULL set of changes after the adjustment. Never stage a second proposal for the same event.
- Staging changes nothing. Say what would change and that it is waiting on their approval. Never claim the calendar has been updated yourself — the approval does that and leaves a receipt.
- If you cannot tell which event they mean, ask rather than guess.`;

const tools = [
  {
    type: "function",
    function: {
      name: "capture_note",
      description: "Save a note to the user's memory.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title (optional)." },
          body: { type: "string", description: "Note body." },
        },
        required: ["body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Create a reminder. Use whenever the user asks you to remind them, nudge them, or follow up at a specific or vague time. Pass the user's exact time phrasing in `when` — the server resolves it against their timezone + default morning/afternoon/evening times.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "What the reminder is about." },
          when: { type: "string", description: "Free-form time hint: 'in 20 minutes', 'tonight', 'tomorrow morning', '5pm Friday', or ISO timestamp." },
          timezone: { type: "string", description: "IANA timezone override. Omit to use the user's saved timezone." },
        },
        required: ["summary", "when"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel an open private Echo reminder. This does not change Google Calendar.",
      parameters: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "stage_action",
      description: "Stage an action for the user to review and approve.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          risk: { type: "string", enum: ["low_reversible", "standard", "high"] },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stage_calendar_change",
      description:
        "Propose a change to a calendar event (move, retitle, add a location or note, set a reminder, cancel) or a brand-new event. This only stages a proposal for approval — it never changes any calendar. Use the user's own words in `event_reference` so the event can be resolved; omit it for a new event. Give exact before and after values.",
      parameters: {
        type: "object",
        properties: {
          event_reference: {
            type: "string",
            description: "How the user referred to the event, e.g. 'my doctor appointment tomorrow'. Omit for a new event.",
          },
          changes: {
            type: "array",
            description: "One entry per field that would change.",
            items: {
              type: "object",
              properties: {
                field: { type: "string", enum: ["time", "title", "location", "description", "reminder", "existence", "attendee"] },
                before: { type: "string", description: "Current value in plain words, or omit if not set." },
                after: { type: "string", description: "New value. ISO timestamp for `time`. Omit to remove (a cancellation for `existence`)." },
              },
              required: ["field"],
              additionalProperties: false,
            },
          },
          attendee_count: { type: "number", description: "People the provider would notify. 0 if nobody else is involved." },
          source_kind: { type: "string", description: "Where the justification came from: telegram, email, file, you." },
          source_note: { type: "string", description: "One human phrase for the source, e.g. \"the clinic's Telegram message\"." },
        },
        required: ["changes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refine_calendar_change",
      description:
        "The user is adjusting the calendar change you already showed them (\"actually 3:30\", \"make it the clinic on Sathorn\", \"drop the reminder\"). Updates that same pending proposal in place and re-asks for approval. Never creates a second proposal and never touches the calendar. Use this instead of stage_calendar_change whenever a proposal is already on the table.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            description: "The full set of fields that would change after the adjustment, not only the newly mentioned one.",
            items: {
              type: "object",
              properties: {
                field: { type: "string", enum: ["time", "title", "location", "description", "reminder", "existence", "attendee"] },
                before: { type: "string", description: "Current value in plain words, or omit if not set." },
                after: { type: "string", description: "New value. ISO timestamp for `time`. Omit for a removal or cancellation." },
              },
              required: ["field"],
              additionalProperties: false,
            },
          },
        },
        required: ["changes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_commitment",
      description: "Record a commitment the user made.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          due_at: { type: "string", description: "ISO timestamp, optional." },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_waiting",
      description: "Mark that the user is waiting on someone or something. Use when they say they're blocked, waiting on a reply, or chasing a person.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "What is being waited on." },
          who: { type: "string", description: "Person, company or system being waited on, if named." },
          due_at: { type: "string", description: "ISO timestamp for when it should have landed, optional." },
          project_id: { type: "string", description: "Project this belongs to, if known from context." },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_decision",
      description: "Log a decision the user has made, so it reads back later as part of the project's history. Only for settled decisions, never for options still being weighed.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "The decision, in one line." },
          reasoning: { type: "string", description: "Why it was decided that way, if the user said." },
          project_id: { type: "string", description: "Project this belongs to, if known from context." },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_artifact",
      description: "Save something produced in this conversation — a draft, a list, a summary — as a keepable artifact, optionally filed against a project.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short name for the artifact." },
          body: { type: "string", description: "The artifact content." },
          project_id: { type: "string", description: "Project to file it against, if known from context." },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_sherlock",
      description: "Invoke Sherlock to surface risks, missing info, contradictions, assumptions, dependencies, and blind spots over a target text or recent thread.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Concrete subject matter to analyze. Pull from the conversation." },
          focus: { type: "string", description: "Optional emphasis: risks | missing | contradictions | compare | full." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_awareness",
      description: "Answer a location- or place-based question by calling the user's awareness layer (briefing for their active place).",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          section: { type: "string", description: "Optional section hint: safety | logistics | connectivity | money | culture | health." },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_schedule",
      description: "Look up the user's schedule: today's commitments and reminders, what's overdue, what's next. All times returned in the user's timezone.",
      parameters: {
        type: "object",
        properties: {
          window: { type: "string", enum: ["today", "tomorrow", "week", "overdue", "next"], description: "Which slice of the schedule to summarize." },
          question: { type: "string", description: "The user's original question, for context." },
        },
        required: ["window"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "travel_time",
      description:
        "How long it takes to drive to something on the person's calendar, and when they should leave: 'how long to drive to my ADHD appointment', 'how far is the meeting tomorrow', 'when should I leave for the clinic'. Uses the place Echo is currently using and the address recorded on the entry. Never estimates: if there is no address or no road route, it says so.",
      parameters: {
        type: "object",
        properties: {
          reference: {
            type: "string",
            description: "The event in their own words, e.g. 'my ADHD appointment' or 'the meeting tomorrow'.",
          },
        },
        required: ["reference"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_mail",
      description: "Search the person's own Gmail for what they asked about: 'what did Nikki say about the pickup', 'anything important in mail about tomorrow'. Read only — it cannot send, delete or label. Only works if they switched Gmail on themselves; if they have not, say so plainly instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "What they want to know, in their own words." },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_file",
      description: "Find a file in the person's own Google Drive by name: 'the document from last month's meeting'. Returns names and links only, never the inside of a file. Only works if they switched Drive on themselves.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words likely in the file name." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "keep_an_eye_on",
      description: "The user wants Echo to keep checking something over time: 'keep an eye on this', 'watch my flight for a time change', 'keep checking until the deposit lands', 'tell me if this appointment moves'. Starts the one watch object, which only observes recorded state and reports — it never writes, books or executes anything, and it stays quiet until something changes.",
      parameters: {
        type: "object",
        properties: {
          reference: { type: "string", description: "The user's own words for the thing to watch." },
          kind: { type: "string", enum: ["calendar_event", "action", "unknown"], description: "calendar_event for anything on the calendar; action for a staged change or payment." },
        },
        required: ["reference"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_watching",
      description: "The user wants Echo to stop keeping an eye on something ('stop watching that').",
      parameters: {
        type: "object",
        properties: { reference: { type: "string", description: "Their words for which one. Use 'that' when they didn't say." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "whats_being_watched",
      description: "Read-only: what Echo is currently keeping an eye on.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "where_do_i_stand",
      description: "Read-only: one compact read of where everything stands — what is waiting on them, what is open, what moved, what can wait, what is already handled. Use for 'where do I stand', 'catch me up', 'what actually needs me today', 'state of things'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "check_page",
      description: "The person points at a public web page and wants it read: 'check this page', 'does my booking still say Sept 20', 'what does this say about the deposit', 'keep an eye on this page'. Reading only — Echo cannot sign in, submit anything, book, cancel or pay. Use this only when the answer is not already in their calendar, mail or files. Set watch true when they ask Echo to keep checking it.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The page address they gave." },
          question: { type: "string", description: "What they want to know from that page." },
          watch: { type: "boolean", description: "True when they want Echo to keep checking the page for changes." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "look_up",
      description: "A public fact that is not in their own calendar, mail or files and has no page to point at: 'what's the number for the pharmacy on King Street', 'is that clinic open Saturday', 'compare current prices', 'what's going on with the flooding in Bangkok', 'latest on the typhoon'. Public web lookup, read only — use it for anything current or changing instead of answering from memory. Always prefer their own connected sources first.",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "What to look up, in plain words." } },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    // Rate limit: 30 calls / 60s per user
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "vanta-converse", _limit: 30, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { conversation_id, message, scope, attachments, verbosity, device } = await req.json();
    const hints: AttachmentHint[] = Array.isArray(attachments) ? attachments.slice(0, 6) : [];

    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: "conversation_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Active scope — Personal (organization_id IS NULL) or one workspace.
    // Every context read below is filtered by it so "what matters?" can only
    // ever mean "what matters in this exact space".
    const scopeType: string = scope?.type === "organization" && scope?.organization_id ? "organization" : scope?.type === "admin" ? "admin" : "personal";
    const scopeOrgId: string | null = scopeType === "organization" ? String(scope.organization_id) : null;
    const scoped = (q: any) =>
      scopeType === "admin" ? q : scopeOrgId ? q.eq("organization_id", scopeOrgId) : q.is("organization_id", null);
    const scopeBlock = `Active scope — answer only from this space:
- scope: ${scopeType}${scopeOrgId ? ` (workspace ${scopeOrgId})` : " (the user's personal space)"}
- Never mention or infer data from another space. If something is not in this space, say you do not see it here.`;

    const workingCandidates = await buildWorkingContext(supabase, scoped).catch(() => []);
    const workingBlock = workingContextBlock(workingCandidates);

    // One router decides what this turn needs: perception, retrieval, research.
    // It can never authorize execution — at most it says a draft may be prepared.
    const plan = routeRequest({
      text: String(message),
      attachments: perceptionInputs(hints),
      scope: scopeType as "personal" | "organization" | "admin",
      organization_id: scopeOrgId,
      verbosity: ["brief", "signal", "spoken", "cue"].includes(String(verbosity)) ? (verbosity as any) : "rich",
    });

    const attachedIds = hints.map((h) => h.ingested_file_id).filter((x): x is string => typeof x === "string" && !!x);
    /* A person names a source the way it exists in the world — "the delivery
       note", "Harbour Logistics" — not "the ingested file". So Echo always
       carries a short list of what it holds, and reads the words off a source
       when the question points at one. Nothing here is a guess: every line
       comes off the record. */
    const askedForFileWords = /\b(file|files|upload|uploaded|attachment|receipt|invoice|pdf|docx|image|screenshot|telegram|ingest|ingested|analy[sz]e|note|document|paper|letter|statement|report|contract|quote|delivery)\b/i.test(String(message));
    const wantsFileContext = true; // Echo always knows what it holds.



    // Load recent context (last ~30 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(30);

    // Stage 3 — pull user's active corrections + recent field notes so Echo
    // never repeats mistakes the user already corrected.
    // Also pull timezone + default morning/afternoon/evening so the model can
    // resolve vague reminder times against the user's actual day shape.
    const [{ data: corrections }, { data: fieldNotes }, { data: profile }, { data: recentFiles }] = await Promise.all([
      scoped(supabase
        .from("corrections")
        .select("surface, target_type, feedback_type, user_note, created_at"))
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8),
      scoped(supabase
        .from("field_notes")
        .select("note_type, summary, location_label, created_at"))
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("profiles")
        .select("timezone, preferences")
        .eq("id", user.id)
        .maybeSingle(),
      // Attachments on this turn win over recency: read exactly what was sent.
      wantsFileContext
        ? (attachedIds.length
            ? scoped(supabase
                .from("ingested_files")
                .select("id, filename, mime_type, source, status, error, created_at, detected_doc_type, suggested_summary, extracted_entities, sensitive, confidence, review_status, metadata, extracted_text"))
                .eq("user_id", user.id)
                .in("id", attachedIds)
                .limit(6)
            : scoped(supabase
                .from("ingested_files")
                .select("id, filename, mime_type, source, status, error, created_at, detected_doc_type, suggested_summary, extracted_entities, sensitive, confidence, review_status, metadata, extracted_text"))
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(6))

        : Promise.resolve({ data: [] }),

    ]);

    const correctionsBlock = (corrections ?? []).length
      ? "Active user corrections (respect these; do not repeat the mistake):\n" +
        (corrections ?? []).map((c: any) =>
          `- [${c.surface}/${c.target_type}] ${c.feedback_type}${c.user_note ? `: ${c.user_note}` : ""}`
        ).join("\n")
      : "";
    const fieldNotesBlock = (fieldNotes ?? []).length
      ? "User field notes (lived context, treat as ground truth from the user):\n" +
        (fieldNotes ?? []).map((n: any) =>
          `- [${n.note_type}]${n.location_label ? ` @ ${n.location_label}` : ""}: ${n.summary}`
        ).join("\n")
      : "";

    const prefs = (profile?.preferences ?? {}) as any;
    const tz = profile?.timezone || "UTC";
    const timeBlock = `User time context — use this when resolving reminder times:
- timezone: ${tz}
- morning default: ${prefs.default_morning_time ?? "08:00"}
- afternoon default: ${prefs.default_afternoon_time ?? "14:00"}
- evening / tonight default: ${prefs.default_evening_time ?? "19:00"}
- quiet hours: ${prefs.quiet_hours_start ?? "22:00"}–${prefs.quiet_hours_end ?? "07:00"}`;

    /* Does this question point at this source? Either the person attached it,
       used file words, or used a word that actually appears in the source's own
       name, type or summary. Pointed-at sources get read; the rest are only
       listed, so Echo can say what it holds without dumping it. */
    const words = String(message).toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) ?? [];
    const pointsAt = (f: any) => {
      if (attachedIds.includes(f.id)) return true;
      const hay = [f.filename, f.detected_doc_type, f.suggested_summary, (f.metadata ?? {}).caption]
        .filter(Boolean).join(" ").toLowerCase();
      return words.some((w) => hay.includes(w));
    };
    const fileRows = (recentFiles ?? []) as any[];
    const fileContextBlock = fileRows.length
      ? "Sources Echo holds in this space (newest first). Read only from these — never invent a source, and if the answer is not in one, say you do not see it:\n" +
        fileRows.map((f: any, idx: number) => {
          const meta = f.metadata ?? {};
          const named = askedForFileWords || pointsAt(f);
          const extracted = named ? String(f.extracted_text ?? "").slice(0, idx === 0 ? 6000 : 1500) : "";
          return [
            `FILE ${idx + 1}: ${f.filename} (${f.id})`,
            `- source: ${f.source ?? "unknown"}; status: ${f.status ?? "unknown"}; uploaded_at: ${f.created_at}`,
            `- mime: ${f.mime_type ?? "unknown"}; extraction: ${meta.extraction ?? "unknown"}; chars: ${meta.chars ?? extracted.length}`,
            `- detected_type: ${f.detected_doc_type ?? "unknown"}; confidence: ${f.confidence ?? "unknown"}; review_status: ${f.review_status ?? "unknown"}; sensitive: ${f.sensitive ? "yes" : "no"}`,
            f.error ? `- ingestion_error: ${f.error}` : "",
            f.suggested_summary ? `- intake_summary: ${f.suggested_summary}` : "",
            f.extracted_entities ? `- extracted_entities: ${JSON.stringify(f.extracted_entities).slice(0, 1200)}` : "",
            extracted
              ? `- extracted_text:\n${extracted}`
              : (f.extracted_text ? "- extracted_text: held back (not asked about this turn)" : "- extracted_text: none available"),
          ].filter(Boolean).join("\n");
        }).join("\n\n")
      : "";

    /* Which sources this answer was actually allowed to read. A receipt written
       later has to name the same source the answer stood on. */
    const groundedSources = fileRows
      .filter((f: any) => (askedForFileWords || pointsAt(f)) && f.extracted_text)
      .map((f: any) => ({ file_id: f.id, name: f.filename, source: f.source ?? null, uploaded_at: f.created_at }));


    // External research — private context shapes the query, never leaves as-is.
    let researchBlock = "";
    if (plan.research) {
      const { data: projectRows } = await scoped(supabase.from("projects").select("title"))
        .neq("status", "archived")
        .limit(60);
      const privateNames = (projectRows ?? [])
        .map((p: any) => String(p.title ?? "").trim())
        .filter((t: string) => t.length > 2);
      const sanitized = sanitizeQuery(String(message), { private_names: privateNames });
      if (sanitized.blocked) {
        researchBlock = [
          "External research: not run.",
          "- Nothing safe to search survived after private details were held back.",
          "- Say you did not search outside, and ask for the public detail you need.",
        ].join("\n");
      } else {
        const limit = plan.research.depth === "deep" ? 6 : plan.research.depth === "standard" ? 4 : 3;
        const sources = await lookupSources(sanitized.query, limit).catch(() => [] as SourceResult[]);
        console.log("research", JSON.stringify(safeResearchLog(sanitized, {
          intent: plan.research.intent,
          depth: plan.research.depth,
          provider: "serpapi",
        })), "sources", sources.length);
        researchBlock = sources.length
          ? [
              `External sources for "${sanitized.query}" (${plan.research.intent}, ${plan.research.depth}). Cite by name, never invent a source:`,
              ...sources.map((s, i) =>
                `[${i + 1}] ${s.title} — ${s.source} (${s.authority}, ${s.freshness})\n${s.url}${s.excerpt ? `\n${s.excerpt}` : ""}`,
              ),
              sanitized.withheld.length
                ? `- Held back from the search: ${sanitized.withheld.join(", ")}. Mention this only if it limits the answer.`
                : "",
              "- If the sources disagree or are only anecdotal, say so instead of picking a side.",
            ].filter(Boolean).join("\n")
          : [
              "External research: no usable sources came back.",
              "- Say plainly that you could not verify this outside, and answer from what you do have.",
            ].join("\n");
      }
    }


    // Brand voice — the user's chosen tone for anything they read.
    const { data: voiceProfile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .maybeSingle();
    const brandBlock = brandVoiceDirective(
      readBrandVoice((voiceProfile?.preferences ?? {}) as Record<string, unknown>),
    );

    // One Echo, many bodies: same facts, same voice, less said on a small screen.
    const depthBlock = depthDirective(bodyForDevice(typeof device === "string" ? device : null));

    /* Calendar truth, read the same way Telegram reads it. Read-only feeds mean
       Echo cannot change a calendar — it has never meant Echo cannot read one. */
    let calendarBlock = "";
    try {
      const { data: calRows } = await supabase
        .from("calendar_events")
        .select("feed_id, uid, starts_at, ends_at, title, location, all_day")
        .eq("user_id", user.id)
        .gte("starts_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(120);
      const calEvents: CalReadEvent[] = ((calRows ?? []) as any[]).map((r) => ({
        feed_id: r.feed_id ?? null,
        uid: r.uid ?? null,
        starts_at: r.starts_at,
        ends_at: r.ends_at ?? null,
        title: r.title ?? "Untitled",
        location: r.location ?? null,
        all_day: r.all_day ?? null,
      }));
      calendarBlock = [
        calendarContextBlock(calEvents, { tz }),
        CALENDAR_CHANGE_DIRECTIVE,
      ].filter(Boolean).join("\n\n");
    } catch (e) { console.error("ask calendar context", e); }

    /* A reply typed on a heads-up card arrives with no words of its own about
       what it answers ("not important", "move it to Friday"). The thread is
       bound to that heads-up, so Echo reads the recorded nudge itself — never
       an inferred subject. */
    let headsUpBlock = "";
    try {
      const { data: thread } = await supabase
        .from("conversations")
        .select("context_kind, context_id, context_label")
        .eq("id", conversation_id)
        .maybeSingle();
      if (thread?.context_kind === "nudge" && thread.context_id) {
        const { data: nudge } = await supabase
          .from("nudges")
          .select("kind, title, body, status, created_at, related_entity_type, related_entity_id")
          .eq("id", thread.context_id)
          .maybeSingle();
        if (nudge) {
          headsUpBlock = [
            "This turn answers a heads-up Echo raised. Treat it as the subject; the person is replying to it, not opening a new topic:",
            `- raised: ${nudge.created_at} (${nudge.kind})`,
            `- said: ${nudge.title}`,
            nudge.body ? `- detail: ${nudge.body}` : "",
            nudge.related_entity_type
              ? `- about: ${nudge.related_entity_type}${nudge.related_entity_id ? ` ${nudge.related_entity_id}` : ""}`
              : "",
            "- If the reply says it does not matter, say plainly that you will leave it alone. Do not stage anything.",
            "- If the reply asks for something to happen, prepare it for approval and say nothing has run.",
          ].filter(Boolean).join("\n");
        }
      } else if (thread?.context_kind && thread.context_label) {
        headsUpBlock = `This thread is about ${thread.context_kind}: ${thread.context_label}. Answer against that record.`;
      }
    } catch (e) { console.error("ask thread context", e); }

    /* Read before speaking.
       Ask used to hand a read back to the browser, which pasted a canned
       paragraph the model had never seen — so the answer and the numbers came
       from two different places and a follow-up ("which first?") had nothing to
       stand on. Now the reads run here, on the same shared code Telegram calls,
       and their results go into the prompt as recorded fact. Reads only: this
       pre-pass cannot capture, stage, approve or execute anything, so nothing
       here touches the approval loop. */
    const priorTurns = (history ?? []).filter((m: any) => m.role === "user" || m.role === "assistant");
    const reads: EchoReadResult[] = [];
    try {
      const prepassKey = Deno.env.get("LOVABLE_API_KEY");
      if (prepassKey) {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${prepassKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: [
                  "You decide which read-only lookups are needed to answer the last message. You do not answer it.",
                  "Call every read that the answer genuinely depends on, and none that it does not.",
                  "Most messages need no read at all — greetings, chat, questions about the calendar (already provided), and anything answerable from the conversation itself. In that case call nothing.",
                ].join("\n"),
              },
              ...priorTurns.slice(-4),
              { role: "user", content: message },
            ],
            tools: ECHO_READ_TOOLS,
          }),
        });
        if (r.ok) {
          const j = await r.json();
          const calls = j?.choices?.[0]?.message?.tool_calls ?? [];
          for (const c of calls.slice(0, 3)) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(c?.function?.arguments || "{}"); } catch { args = {}; }
            const got = await runEchoRead(supabase as never, String(c?.function?.name ?? ""), args, {
              userId: user.id,
              orgId: scopeOrgId,
              tz,
            });
            if (got) reads.push(got);
          }
        } else {
          console.error("[vanta] read pre-pass", r.status);
        }
      }
    } catch (e) {
      /* A failed read must never cost the person their answer — Echo simply
         answers without it rather than claiming a read it did not perform. */
      console.error("read pre-pass failed", e);
    }

    /* "What can you do?" is answered from recorded connections, never from the
       model's imagination. The facts go in as a block so Echo answers in its own
       voice while staying unable to advertise a power it does not have. */
    let abilitiesFacts = "";
    if (matchAbilityQuestion(message)) {
      try {
        abilitiesFacts = abilitiesBlock(echoAbilities(await readAbilityFacts(admin as never, user.id)));
      } catch (e) {
        console.error("ability facts failed", e);
      }
    }

    /* Everyday life is answered off the same rule: connected reads say what they
       can read, unconnected ones say what they are waiting on. */
    let lifeFacts = "";
    if (matchLifeQuestion(message)) {
      try {
        lifeFacts = lifeBlock(lifeDomains(await readLifeFacts(admin as never, user.id)));
      } catch (e) {
        console.error("life facts failed", e);
      }
    }

    /* Judgement, not a mode. One block, built only from recorded evidence, and
       empty when there is nothing to say about the shape of the situation. */
    let judgeBlock = "";
    try {
      judgeBlock = judgmentBlock(await gatherJudgment(admin as never, user.id, message));
    } catch (e) {
      console.error("judgment failed", e);
    }

    const sysWithCorrections = [SYSTEM_PROMPT, brandBlock, depthBlock, scopeBlock, timeBlock, planBlock(plan, hints), workingBlock, headsUpBlock, correctionsBlock, fieldNotesBlock, calendarBlock, readsBlock(reads), abilitiesFacts, lifeFacts, judgeBlock, fileContextBlock, researchBlock]
      .filter(Boolean).join("\n\n");

    const messages = [
      { role: "system", content: sysWithCorrections },
      ...priorTurns,
      { role: "user", content: message },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        stream: true,
        /* Any read the pre-pass now owns is withheld from the answering model,
           so the browser can never be asked to paste a second answer beside
           the one being streamed. Write and staging tools are untouched. */
        tools: tools.filter((t: any) => !isEchoRead(String(t?.function?.name ?? ""))),
      }),
    });

    if (upstream.status === 429 || upstream.status === 402) {
      return new Response(JSON.stringify({ error: upstream.status === 429 ? "rate limited" : "credits exhausted" }), {
        status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text();
      return new Response(JSON.stringify({ error: "ai gateway error", detail: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pass through SSE, but additionally peek for tool calls and emit intent events.
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        const reader = upstream.body!.getReader();
        let buf = "";
        const toolBuf = new Map<number, { name: string; args: string }>();

        /* Provenance, up front: the reads that shaped this answer, in plain
           English, so "Why this?" names real lookups instead of guessing. */
        if (reads.length) {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ reads: readProvenance(reads) })}\n\n`),
          );
        }

        const flushTools = () => {
          for (const [, t] of toolBuf) {
            try {
              const args = t.args ? JSON.parse(t.args) : {};
              const evt = `data: ${JSON.stringify({ intent: { name: t.name, args, grounding: { sources: groundedSources, asked_at: new Date().toISOString() } } })}\n\n`;
              controller.enqueue(enc.encode(evt));
            } catch { /* ignore */ }
          }
          toolBuf.clear();
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          buf += chunk;
          // Re-emit upstream chunk verbatim so client gets token-by-token text
          controller.enqueue(value);

          // Parse to capture tool deltas
          let i: number;
          while ((i = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") continue;
            try {
              const p = JSON.parse(json);
              const tc = p.choices?.[0]?.delta?.tool_calls as any[] | undefined;
              if (tc) {
                for (const t of tc) {
                  const idx = t.index ?? 0;
                  const cur = toolBuf.get(idx) ?? { name: "", args: "" };
                  if (t.function?.name) cur.name = t.function.name;
                  if (t.function?.arguments) cur.args += t.function.arguments;
                  toolBuf.set(idx, cur);
                }
              }
              const finish = p.choices?.[0]?.finish_reason;
              if (finish === "tool_calls" || finish === "stop") flushTools();
            } catch { /* partial */ }
          }
        }
        flushTools();
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("vanta-converse error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
