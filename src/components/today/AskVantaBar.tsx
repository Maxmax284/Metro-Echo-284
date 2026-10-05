import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAskContext } from "@/hooks/useAskContext";
import { useScope } from "@/hooks/useScope";

const QUICK = [
  "What matters?",
  "What happened?",
  "What should I do?",
  "Handle this.",
];

/**
 * AskVantaBar — the primary way into Metro Echo. Not a side widget: it sits at the
 * top of Today, carries the active scope in its wording, and hands the question
 * to Echo through the one context door — the thread it opens is bound to the
 * Today board, so Echo knows where the question was asked from.
 */
export function AskVantaBar() {
  const { openAskWithContext } = useAskContext();
  const { destination } = useScope();
  const [text, setText] = useState("");

  function ask(q: string) {
    const question = q.trim();
    if (!question) return;
    /* The person typed the words and hit send, so send:true is honest here.
       Every other surface prefills and lets the person press send themselves. */
    void openAskWithContext({ kind: "today", label: destination, question, send: true });
    setText("");
  }

  return (
    <section className="vanta-card p-3 sm:p-4" aria-label="Ask Echo">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Ask Echo</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">{destination}</span>
      </div>

      <form
        className="mt-2.5 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about anything in this space…"
          aria-label="Ask Echo a question"
          className="h-11 text-sm"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Send question" disabled={!text.trim()}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="min-h-[36px] rounded-full border border-border/60 bg-surface-elevated px-3 text-xs text-foreground/90 transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Echo answers from this space only. Anything it wants to do comes back as a draft for you to approve.
      </p>
    </section>
  );
}
