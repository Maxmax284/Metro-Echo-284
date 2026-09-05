import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// vanta-converse: streams a conversational response from Lovable AI Gateway,
// loads recent conversation context, and emits intent events for the client to apply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { COMPANION_VOICE } from "../_shared/vantaVoice.ts";
import { brandVoiceDirective, readBrandVoice } from "../_shared/brandVoice.ts";
import { bodyForDevice, depthDirective } from "../_shared/responseDepth.ts";
import { ROUTING_RULES, VOICE_RULES, STRUCTURE_RULES } from "../_shared/routingRules.ts";
import { buildWorkingContext, workingContextBlock } from "../_shared/workingContext.ts";
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
Sherlock investigations, query awareness, and read the user's schedule — all
through your tools. If a supported tool fits the request, call it.

${ROUTING_RULES}

Additional in-app context:
- If recent file context is provided, use it as source material. Do not ask the
  user to paste the file again. If extraction failed or produced no text, say
  exactly that and name the file/status.

${VOICE_RULES}

${STRUCTURE_RULES}`;

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
    const wantsFileContext = attachedIds.length > 0
      || /\b(file|files|upload|uploaded|attachment|receipt|invoice|pdf|docx|image|screenshot|telegram|ingest|ingested|analy[sz]e)\b/i.test(String(message));


    // Load recent context (last ~30 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(30);

    // Stage 3 — pull user's active corrections + recent field notes so Vanta
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
                .limit(3))
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

    const fileContextBlock = wantsFileContext && (recentFiles ?? []).length
      ? "Recent uploaded / inbound files (newest first; use as source context when the user references an uploaded, ingested, Telegram, or receipt file):\n" +
        (recentFiles ?? []).map((f: any, idx: number) => {
          const meta = f.metadata ?? {};
          const extracted = String(f.extracted_text ?? "").slice(0, idx === 0 ? 6000 : 1200);
          return [
            `FILE ${idx + 1}: ${f.filename} (${f.id})`,
            `- source: ${f.source ?? "unknown"}; status: ${f.status ?? "unknown"}; uploaded_at: ${f.created_at}`,
            `- mime: ${f.mime_type ?? "unknown"}; extraction: ${meta.extraction ?? "unknown"}; chars: ${meta.chars ?? extracted.length}`,
            `- detected_type: ${f.detected_doc_type ?? "unknown"}; confidence: ${f.confidence ?? "unknown"}; review_status: ${f.review_status ?? "unknown"}; sensitive: ${f.sensitive ? "yes" : "no"}`,
            f.error ? `- ingestion_error: ${f.error}` : "",
            f.suggested_summary ? `- intake_summary: ${f.suggested_summary}` : "",
            f.extracted_entities ? `- extracted_entities: ${JSON.stringify(f.extracted_entities).slice(0, 1200)}` : "",
            extracted ? `- extracted_text:\n${extracted}` : "- extracted_text: none available",
          ].filter(Boolean).join("\n");
        }).join("\n\n")
      : "";

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

    // One Vanta, many bodies: same facts, same voice, less said on a small screen.
    const depthBlock = depthDirective(bodyForDevice(typeof device === "string" ? device : null));

    const sysWithCorrections = [SYSTEM_PROMPT, brandBlock, depthBlock, scopeBlock, timeBlock, planBlock(plan, hints), workingBlock, correctionsBlock, fieldNotesBlock, fileContextBlock, researchBlock]
      .filter(Boolean).join("\n\n");


    const messages = [
      { role: "system", content: sysWithCorrections },
      ...(history ?? []).filter((m: any) => m.role === "user" || m.role === "assistant"),
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
        tools,
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

        const flushTools = () => {
          for (const [, t] of toolBuf) {
            try {
              const args = t.args ? JSON.parse(t.args) : {};
              const evt = `data: ${JSON.stringify({ intent: { name: t.name, args } })}\n\n`;
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
