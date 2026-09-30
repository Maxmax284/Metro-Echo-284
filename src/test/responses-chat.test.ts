// responsesChat — the one conversational brain. The event reducer is pure, so
// the exact wire shapes the gateway sends get pinned here: text deltas flow in
// order, a function call emits exactly once with its full arguments, and the
// output_item.done fallback covers a missing arguments.done.
import { describe, expect, it } from "vitest";
import { createTurnReducer, toResponsesTools, type TurnDelta } from "../../supabase/functions/_shared/responsesChat";

function kinds(deltas: TurnDelta[]) {
  return deltas.map((d) => d.kind);
}

describe("toResponsesTools", () => {
  it("flattens chat-completions tools into the Responses shape", () => {
    const out = toResponsesTools([
      {
        type: "function",
        function: {
          name: "capture_note",
          description: "Save a note.",
          parameters: { type: "object", properties: { body: { type: "string" } } },
        },
      },
      { type: "not-a-tool" },
    ]);
    expect(out).toEqual([
      {
        type: "function",
        name: "capture_note",
        description: "Save a note.",
        parameters: { type: "object", properties: { body: { type: "string" } } },
      },
    ]);
  });
});

describe("createTurnReducer", () => {
  it("passes text deltas through in order", () => {
    const r = createTurnReducer();
    const a = r.push({ type: "response.output_text.delta", delta: "Heads up" });
    const b = r.push({ type: "response.output_text.delta", delta: " — rain." });
    expect(kinds([...a, ...b])).toEqual(["text", "text"]);
    expect((a[0] as { delta: string }).delta).toBe("Heads up");
    expect((b[0] as { delta: string }).delta).toBe(" — rain.");
  });

  it("assembles a function call across deltas and emits it exactly once", () => {
    const r = createTurnReducer();
    expect(r.push({
      type: "response.output_item.added",
      output_index: 0,
      item: { id: "fc_1", type: "function_call", name: "capture_note", arguments: "" },
    })).toEqual([]);
    expect(r.push({ type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "{\"bo" })).toEqual([]);
    expect(r.push({ type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "dy\":\"x\"}" })).toEqual([]);

    const done = r.push({
      type: "response.function_call_arguments.done",
      item_id: "fc_1",
      arguments: "{\"body\":\"x\"}",
    });
    expect(done).toEqual([{ kind: "tool", call: { name: "capture_note", arguments: "{\"body\":\"x\"}" } }]);

    /* output_item.done after arguments.done must not double-emit. */
    expect(r.push({
      type: "response.output_item.done",
      output_index: 0,
      item: { id: "fc_1", type: "function_call", name: "capture_note", arguments: "{\"body\":\"x\"}" },
    })).toEqual([]);
  });

  it("falls back to output_item.done when arguments.done never arrives", () => {
    const r = createTurnReducer();
    r.push({
      type: "response.output_item.added",
      output_index: 0,
      item: { id: "fc_2", type: "function_call", name: "set_reminder", arguments: "" },
    });
    r.push({ type: "response.function_call_arguments.delta", item_id: "fc_2", delta: "{\"summary\":\"call Dani\"" });
    const out = r.push({
      type: "response.output_item.done",
      output_index: 0,
      item: { id: "fc_2", type: "function_call", name: "set_reminder", arguments: "{\"summary\":\"call Dani\"}" },
    });
    expect(out).toEqual([
      { kind: "tool", call: { name: "set_reminder", arguments: "{\"summary\":\"call Dani\"}" } },
    ]);
  });

  it("ignores reasoning and lifecycle noise without swallowing the answer", () => {
    const r = createTurnReducer();
    expect(r.push({ type: "response.created" })).toEqual([]);
    expect(r.push({ type: "response.reasoning_summary_text.delta", delta: "thinking" })).toEqual([]);
    expect(r.push({ type: "response.completed", response: { status: "completed" } })).toEqual([]);
    const text = r.push({ type: "response.output_text.delta", delta: "Still here." });
    expect(kinds(text)).toEqual(["text"]);
  });
});
