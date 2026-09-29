// DeviceReachSection — the teaching half of the old connections panel.
//
// Connection health has one home (Platform integrations). This section keeps
// only what that page doesn't say: which kinds of devices can reach Echo at
// all, and what each path is for. No statuses here — nothing to go stale.
import { DEVICE_FAMILIES } from "@/lib/connections";
import { cn } from "@/lib/utils";

export function DeviceReachSection() {
  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
        Ways a device can reach Echo
      </p>
      <ul className="mt-2 space-y-2">
        {DEVICE_FAMILIES.map((f) => (
          <li key={f.key} className="rounded-lg bg-muted/15 p-2.5 ring-1 ring-border/30">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 text-[12px] font-medium">{f.label}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                  f.supported
                    ? "bg-primary/12 text-primary ring-primary/25"
                    : "bg-muted/40 text-muted-foreground ring-border/60",
                )}
              >
                {f.supported ? "Supported" : "Not yet"}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{f.what}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-foreground/70">
              {f.examples.join(" · ")}
            </p>
            {f.caveat ? (
              <p className="mt-0.5 text-[10.5px] italic leading-snug text-muted-foreground/80">
                {f.caveat}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
