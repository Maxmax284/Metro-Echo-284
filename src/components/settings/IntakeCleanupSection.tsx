import { useIntakePrefs } from "@/hooks/useIntakePrefs";
import { useIntakeDismissals } from "@/hooks/useIntakeDismissals";
import { Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Settings → Inbox & Command Center cleanup.
 * Plain-English controls for visibility windows, dismissal stickiness,
 * duplicate grouping, and section limits.
 */
export function IntakeCleanupSection() {
  const { intake, updateIntake, loading } = useIntakePrefs();
  const { dismissed, restore } = useIntakeDismissals();

  if (loading) return null;

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Inbox &amp; Command Center cleanup</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Stop old or dismissed captures from cluttering your day. Memory stays searchable
            either way.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <Choice
          label="Hide old loose captures after…"
          value={String(intake.capture_visibility_days)}
          options={[
            { v: "2", label: "2 days" },
            { v: "3", label: "3 days" },
            { v: "7", label: "1 week" },
            { v: "14", label: "2 weeks" },
          ]}
          onChange={(v) => updateIntake({ capture_visibility_days: Number(v) })}
        />

        <Choice
          label="When something gets old and isn't attached…"
          value={intake.unattached_after_window}
          options={[
            { v: "collapse", label: "Collapse it" },
            { v: "archive", label: "Archive it" },
            { v: "keep", label: "Keep showing it" },
            { v: "ask", label: "Ask me" },
          ]}
          onChange={(v) =>
            updateIntake({ unattached_after_window: v as any })
          }
        />

        <Choice
          label="When I dismiss something…"
          value={intake.dismissed_behavior}
          options={[
            { v: "sticky", label: "Stay hidden unless I restore it" },
            { v: "show_restore", label: "Show a small restore button" },
          ]}
          onChange={(v) => updateIntake({ dismissed_behavior: v as any })}
        />

        <Choice
          label="When similar captures arrive…"
          value={intake.duplicate_grouping}
          options={[
            { v: "group", label: "Group them together" },
            { v: "hide_dupes", label: "Hide duplicates" },
            { v: "newest_only", label: "Show only the newest" },
            { v: "show_all", label: "Show everything" },
          ]}
          onChange={(v) => updateIntake({ duplicate_grouping: v as any })}
        />

        <Choice
          label="How many items per Command Center section?"
          value={String(intake.command_center_section_limit)}
          options={[
            { v: "3", label: "Latest 3" },
            { v: "5", label: "Latest 5" },
            { v: "10", label: "Latest 10" },
            { v: "20", label: "Latest 20" },
          ]}
          onChange={(v) =>
            updateIntake({ command_center_section_limit: Number(v) })
          }
        />
      </div>

      {dismissed.size > 0 && (
        <div className="mt-5 rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-medium">
              Dismissed items ({dismissed.size})
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[11px]"
              onClick={() => {
                for (const k of dismissed) {
                  const [kind, id] = k.split(":");
                  void restore(kind, id);
                }
              }}
            >
              <Undo2 className="h-3 w-3" /> Restore all
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hidden from Command Center and Inbox. Still searchable in Memory.
          </p>
        </div>
      )}
    </section>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.v === value;
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
