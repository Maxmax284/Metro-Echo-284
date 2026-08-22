// BrandVoiceSection — how Vanta talks to you.
//
// Doctrine: tone is a preference, not a personality. This only changes phrasing
// in reviews, briefs, recaps, answers and notices. Facts, confidence wording and
// receipts never change. The preview below runs the real formatter, so what you
// read here is what lands in your chat.
import { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  BRAND_VOICE_DEFAULTS,
  brandVoiceSample,
  readBrandVoice,
  type BrandTone,
} from "@/lib/brandVoice";

const TONES: { value: BrandTone; label: string; blurb: string }[] = [
  { value: "neutral", label: "Neutral", blurb: "Calm and plain. No accent." },
  { value: "east_coast", label: "East Coast", blurb: "Blunt, dry, straight to the point." },
];

const INTENSITY_LABEL: Record<number, string> = {
  1: "Light seasoning",
  2: "Clearly flavoured",
  3: "Full accent",
};

export function BrandVoiceSection() {
  const { prefs, loading, update } = useUserPreferences();
  const bv = useMemo(() => readBrandVoice(prefs as unknown as Record<string, unknown>), [prefs]);
  const sample = useMemo(() => brandVoiceSample(bv), [bv]);

  const isDefault =
    bv.brand_voice === BRAND_VOICE_DEFAULTS.brand_voice &&
    bv.brand_voice_intensity === BRAND_VOICE_DEFAULTS.brand_voice_intensity &&
    bv.brand_voice_no_jargon === BRAND_VOICE_DEFAULTS.brand_voice_no_jargon;

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
            Brand voice
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            How Vanta phrases reviews, briefs, recaps and notices. Facts and receipts stay exactly
            as they are.
          </p>
        </div>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => update(BRAND_VOICE_DEFAULTS as never)}
          >
            Reset
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {TONES.map((t) => {
          const active = bv.brand_voice === t.value;
          return (
            <button
              key={t.value}
              type="button"
              disabled={loading}
              onClick={() => update({ brand_voice: t.value } as never)}
              className={cn(
                "vanta-focus rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 hover:bg-muted/40",
              )}
              aria-pressed={active}
            >
              <span className="block text-[13px] font-medium">{t.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t.blurb}</span>
            </button>
          );
        })}
      </div>

      {bv.brand_voice === "east_coast" && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium">How much seasoning</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {INTENSITY_LABEL[bv.brand_voice_intensity]}
            </span>
          </div>
          <Slider
            className="mt-2"
            min={1}
            max={3}
            step={1}
            value={[bv.brand_voice_intensity]}
            onValueChange={([v]) => update({ brand_voice_intensity: v as 1 | 2 | 3 } as never)}
            aria-label="Brand voice intensity"
          />
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-border/50 pt-3">
        <div>
          <span className="block text-[12px] font-medium">No tech jargon</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Strips words like payload, webhook, sync and endpoint out of anything you read.
          </span>
        </div>
        <Switch
          checked={bv.brand_voice_no_jargon}
          disabled={loading}
          onCheckedChange={(v) => update({ brand_voice_no_jargon: v } as never)}
          aria-label="No tech jargon"
        />
      </div>

      <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Sample notice
        </span>
        <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed">{sample}</p>
      </div>
    </section>
  );
}
