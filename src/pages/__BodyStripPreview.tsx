// Temporary visual harness for the body read. Deleted after the layout check.
import { BodyLiveStrip } from "@/components/wearables/BodyLiveStrip";
import type { Reading } from "@/lib/wearable";

const today = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
};

const READINGS: Reading[] = [
  { kind: "resting_heart_rate", value: 54, unit: "bpm", measured_at: today(6), source: "ingest" },
  { kind: "sleep", value: 431, unit: "min", measured_at: today(7), source: "ingest" },
  { kind: "steps", value: 8421, unit: "steps", measured_at: today(11), source: "ingest" },
  { kind: "heart_rate", value: 132, unit: "bpm", measured_at: today(14), source: "ingest" },
  { kind: "calories", value: 640, unit: "kcal", measured_at: today(17), source: "ingest" },
  { kind: "weight", value: 78.4, unit: "kg", measured_at: today(19), source: "manual" },
];

export default function BodyStripPreview() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="vanta-card p-3.5">
        <BodyLiveStrip readings={READINGS} tall />
      </div>
      <div className="vanta-card p-3.5">
        <BodyLiveStrip readings={READINGS} tall={false} />
      </div>
      <div className="vanta-card p-3.5">
        <BodyLiveStrip readings={[]} tall />
      </div>
    </div>
  );
}
