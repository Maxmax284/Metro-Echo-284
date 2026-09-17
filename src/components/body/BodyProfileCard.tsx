// BodyProfileCard — who these numbers belong to, in your own words.
//
// Context only. It changes how Echo phrases things and what counts as your
// normal. It sets no target, scores nothing, and never turns into advice.
// Everything is optional; a blank field stays blank and is never filled in from
// readings.
import { useEffect, useState } from "react";
import { Check, Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel } from "@/components/ui/instrument";
import { vantaToast } from "@/lib/vantaVoice";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  AGE_BANDS,
  BODY_PROFILE_LAW,
  BUILD_LABEL,
  LIFE_MODE_LABEL,
  SLEEP_HABIT_LABEL,
  bodyProfileLines,
  hasBodyProfile,
  sanitizeBodyProfile,
  type BodyProfile,
  type Build,
  type LifeMode,
  type SleepHabit,
} from "@/lib/bodyProfile";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-[36px] items-center rounded-[2px] border px-2.5 text-[11.5px]",
    MOTION_FOCUS,
    on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 text-foreground/80",
  );

const field = cn(
  "mt-1 w-full rounded-[2px] border border-border/60 bg-background/40 px-2 py-2 text-[12.5px]",
  MOTION_FOCUS,
);

export function BodyProfileCard() {
  const { prefs, update, loading } = useUserPreferences();
  const stored = sanitizeBodyProfile((prefs as any).body_profile);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BodyProfile>(stored);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setDraft(sanitizeBodyProfile((prefs as any).body_profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, JSON.stringify((prefs as any).body_profile)]);

  const set = (patch: Partial<BodyProfile>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleDay = (d: number) => {
    const days = new Set(draft.training_days ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    set({ training_days: [...days].sort() });
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = sanitizeBodyProfile({ ...draft, updated_at: new Date().toISOString() });
      await update({ body_profile: clean } as any);
      vantaToast.success({
        title: "Saved",
        description: "Echo will phrase things with this in mind. It stays context, never a target.",
      });
      setOpen(false);
    } catch (e) {
      vantaToast.error({
        title: "Not saved",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const lines = bodyProfileLines(stored);

  return (
    <section className="vanta-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">About you</MachineLabel>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "ml-auto min-h-[32px] rounded-[2px] border border-border/60 px-2 text-[10.5px] text-foreground/85 hover:border-primary/40",
            MOTION_FOCUS,
          )}
        >
          {open ? "Close" : hasBodyProfile(stored) ? "Change it" : "Fill it in"}
        </button>
      </div>

      {!open ? (
        lines.length ? (
          <ul className="mt-2 space-y-1">
            {lines.map((l) => (
              <li key={l} className="text-[12px] leading-snug text-foreground/90">
                {l}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            Nothing here yet. Tell Echo the shape of your life — everyday or athlete, what you
            actually do, how you sleep — and it will talk about your readings in those terms instead
            of generic ones.
          </p>
        )
      ) : (
        <div className="mt-2.5 space-y-3">
          <div>
            <MachineLabel className="text-foreground/70">Age</MachineLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {AGE_BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set({ age_band: draft.age_band === b ? null : b })}
                  aria-pressed={draft.age_band === b}
                  className={chip(draft.age_band === b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 min-[420px]:grid-cols-2">
            <label className="block">
              <MachineLabel className="text-foreground/70">Height in cm</MachineLabel>
              <input
                type="number"
                inputMode="numeric"
                min={100}
                max={250}
                value={draft.height_cm ?? ""}
                onChange={(e) => set({ height_cm: e.target.value ? Number(e.target.value) : null })}
                className={field}
                placeholder="Leave blank if you'd rather not"
              />
            </label>
            <label className="block">
              <MachineLabel className="text-foreground/70">What you mostly do</MachineLabel>
              <input
                value={draft.main_activity ?? ""}
                onChange={(e) => set({ main_activity: e.target.value })}
                className={field}
                placeholder="Muay Thai, walking, gym, nothing much"
              />
            </label>
          </div>

          <div>
            <MachineLabel className="text-foreground/70">Build</MachineLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(BUILD_LABEL) as Build[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set({ build: draft.build === b ? null : b })}
                  aria-pressed={draft.build === b}
                  className={chip(draft.build === b)}
                >
                  {BUILD_LABEL[b]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <MachineLabel className="text-foreground/70">How you live</MachineLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(LIFE_MODE_LABEL) as LifeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ life_mode: draft.life_mode === m ? null : m })}
                  aria-pressed={draft.life_mode === m}
                  className={chip(draft.life_mode === m)}
                >
                  {LIFE_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <MachineLabel className="text-foreground/70">Sleep</MachineLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(SLEEP_HABIT_LABEL) as SleepHabit[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set({ sleep_habit: draft.sleep_habit === h ? null : h })}
                  aria-pressed={draft.sleep_habit === h}
                  className={chip(draft.sleep_habit === h)}
                >
                  {SLEEP_HABIT_LABEL[h]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <MachineLabel className="text-foreground/70">Days you usually train</MachineLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAYS.map((label, d) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={draft.training_days?.includes(d) ?? false}
                  className={chip(draft.training_days?.includes(d) ?? false)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <MachineLabel className="text-foreground/70">Anything Echo should keep in mind</MachineLabel>
            <textarea
              value={draft.keep_in_mind ?? ""}
              onChange={(e) => set({ keep_in_mind: e.target.value })}
              rows={2}
              className={field}
              placeholder="Old knee, shift work, whatever matters"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] border border-primary/50 bg-primary/10 px-3 text-[12px] font-medium text-foreground disabled:opacity-60",
                MOTION_FOCUS,
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            <p className="text-[11px] leading-snug text-muted-foreground">{BODY_PROFILE_LAW}</p>
          </div>
        </div>
      )}
    </section>
  );
}
