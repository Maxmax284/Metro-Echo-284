import { describe, expect, it } from "vitest";
import {
  chatChunkToResponsesEvents,
  createChatChunkState,
  createTurnReducer,
  flushChatCalls,
  shouldUseBackupBrain,
} from "../../supabase/functions/_shared/responsesChat";

describe("backup brain", () => {
  it("only steps in when the primary is down, never on a slow-down or an allowance", () => {
    expect([502, 503, 504].every(shouldUseBackupBrain)).toBe(true);
    expect([429, 402, 403, 400, 500].some(shouldUseBackupBrain)).toBe(false);
  });

  it("translates text and a split tool call into the same deltas the primary gives", () => {
    const state = createChatChunkState();
    const reducer = createTurnReducer();
    const chunks = [
      { choices: [{ delta: { content: "On it" } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "stage_note", arguments: '{"ti' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'tle":"x"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ];
    const deltas = chunks.flatMap((c) => chatChunkToResponsesEvents(c, state)).flatMap((e) => reducer.push(e));
    expect(deltas).toEqual([
      { kind: "text", delta: "On it" },
      { kind: "tool", call: { name: "stage_note", arguments: '{"title":"x"}', callId: "c1" } },
    ]);
    expect(flushChatCalls(state)).toEqual([]); // emitted exactly once
  });
});
