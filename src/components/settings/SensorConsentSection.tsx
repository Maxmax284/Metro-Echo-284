// SensorConsentSection — every sense is opted into one at a time.
//
// Off is the default and off means off: nothing probes, nothing infers, and
// nothing gets read because a neighbouring toggle happened to be on.
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { SENSORS, SENSOR_DETAIL, SENSOR_LABEL, type SensorKey } from "@/lib/awareness";

export function SensorConsentSection() {
  const { prefs, update, loading } = useUserPreferences();
  const consent = (prefs.sensor_consent ?? {}) as Partial<Record<SensorKey, boolean>>;

  const set = (key: SensorKey, value: boolean) =>
    update({ sensor_consent: { ...consent, [key]: value } });

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What Echo is allowed to sense</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            One switch per sense. Everything starts off, and turning one on never turns on another.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {SENSORS.map((key) => (
          <li
            key={key}
            className="flex items-start justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2.5 ring-1 ring-border/40"
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium">{SENSOR_LABEL[key]}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                {SENSOR_DETAIL[key]}
              </div>
            </div>
            <Switch
              checked={consent[key] === true}
              disabled={loading}
              onCheckedChange={(v) => set(key, v)}
              aria-label={SENSOR_LABEL[key]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
