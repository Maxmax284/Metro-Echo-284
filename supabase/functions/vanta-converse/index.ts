// vanta-converse: streams a conversational response from Lovable AI Gateway,
// loads recent conversation context, and emits intent events for the client to apply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { COMPANION_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `${COMPANION_VOICE}

You help with capture, planning, awareness, and staging actions. You CAN create
notes, set reminders, track commitments, stage actions for approval, run
Sherlock investigations, query awareness, and read the user's schedule — all
through your tools. NEVER tell the user "I can't directly set reminders" or
"I'm unable to add notes" or anything similar. If a supported tool fits the
request, call it. If a detail is missing (like the time for a reminder), ask
ONE short clarifying question instead of refusing.

Tool routing rules:
- "Remind me…" / "Set a reminder…" / "Nudge me…" / "Follow up…" → call set_reminder with summary + the user's exact time phrasing in "when".
- "Add a note…" / "Save this…" / "Remember this…" / "File this…" → call capture_note.
- "I promised…" / "I committed to…" / "Track this as a commitment" → call add_commitment.
- "Draft an action…" / external action → call stage_action.
- "Analyze this" / "what am I missing" / "what risks" / "critique" → call run_sherlock.
- Location/place question → call query_awareness.
- "What's on today" / "what's due" / "schedule" → call query_schedule.

Voice rules:
- Warm but grounded. East-coast plain English. Vary phrasing — don't sound canned.
- Occasional emoji on success acknowledgements is fine (⏰ for reminders, 📝 for notes).
  Never use emoji on errors, warnings, or anything serious.
- Never write "Great news!", "Absolutely, I'd be happy to assist!", "As an AI…",
  "I'm just a language model", or any other generic chatbot filler.
- Acknowledge uncertainty out loud. Don't fake confidence.
- One or two short sentences beats three.`;

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Rate limit: 30 calls / 60s per user
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "vanta-converse", _limit: 30, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: "conversation_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const [{ data: corrections }, { data: fieldNotes }, { data: profile }] = await Promise.all([
      supabase
        .from("corrections")
        .select("surface, target_type, feedback_type, user_note, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("field_notes")
        .select("note_type, summary, location_label, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("profiles")
        .select("timezone, preferences")
        .eq("id", user.id)
        .maybeSingle(),
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

    const sysWithCorrections = [SYSTEM_PROMPT, timeBlock, correctionsBlock, fieldNotesBlock]
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
