import { useCallback, useEffect, useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { Inbox as InboxIcon } from "lucide-react";
import { CapturesView } from "@/components/memory/CapturesView";
import { MemoryFilesView } from "@/components/memory/MemoryFilesView";
import { InboxNotesList } from "@/components/inbox/InboxNotesList";
import { cn } from "@/lib/utils";
import { DeskIntro } from "@/components/work/DeskIntro";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";

type Tab = "captures" | "notes" | "files";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "captures", label: "Captures", hint: "Telegram, email, voice, screenshots" },
  { id: "notes", label: "Notes", hint: "Things you typed in" },
  { id: "files", label: "Files", hint: "Uploads and attachments" },
];

/**
 * InboxSurface — one home for everything that lands in Vanta before it's
 * organized. Sub-tabs reuse existing views; per-tab multi-select + bulk
 * “Push to project” pushes items into a Living Brief.
 *
 * Each tab carries its own count, so you can tell which door is busy without
 * opening all three. Counts are read-only and never change a record.
 */
export function InboxSurface() {
  const [tab, setTab] = useState<Tab>("captures");
  const active = TABS.find((t) => t.id === tab)!;
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [counts, setCounts] = useState<Record<Tab, number | null>>({
    captures: null,
    notes: null,
    files: null,
  });

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [captures, notes, files] = await Promise.all([
        applyScope(supabase.from("notes").select("id", { count: "exact", head: true })).not("source", "is", null),
        applyScope(supabase.from("notes").select("id", { count: "exact", head: true })).is("source", null),
        applyScope(supabase.from("memory_files").select("id", { count: "exact", head: true })),
      ]);
      setCounts({
        captures: (captures as { count?: number | null })?.count ?? 0,
        notes: (notes as { count?: number | null })?.count ?? 0,
        files: (files as { count?: number | null })?.count ?? 0,
      });
    } catch {
      /* A missing count is not worth an error state — the tabs still work. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey]);

  useEffect(() => { void load(); }, [load]);

  const total = Object.values(counts).reduce<number>((a, c) => a + (c ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-7">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Inbox</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Stuff lands here first. Pick what belongs together and push it into a project.
        </p>
      </header>

      <DeskIntro deskKey="inbox" populated={total > 0} className="mb-3" />

      <div
        role="tablist"
        aria-label="Inbox sections"
        className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-surface-elevated p-1"
      >
        {TABS.map((t) => {
          const isActive = t.id === tab;
          const n = counts[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {n !== null && n > 0 && (
                <span className="rounded-[2px] bg-primary/15 px-1 text-[10px] font-medium text-primary">
                  {n}
                </span>
              )}
            </button>
          );
        })}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          {active.hint}
        </span>
      </div>

      <div className="min-h-[200px]">
        {tab === "captures" && <CapturesView />}
        {tab === "notes" && <InboxNotesList />}
        {tab === "files" && <MemoryFilesView />}
      </div>

      <SurfaceAftermath surface="inbox" />
    </div>
  );
}
