import { ALL_CALLBACKS, ALL_EVENTS } from "@/lib/integrations/registry";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/integrations/status";
import { cn } from "@/lib/utils";

export function EventRegistryTable() {
  return (
    <section className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <h2 className="text-sm font-semibold">Event registry</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Every event a connected platform is allowed to send into Metro Echo.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[11.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1">Platform</th>
              <th>Event</th>
              <th>Status</th>
              <th>Creates</th>
              <th>Approval</th>
              <th>Sensitive</th>
            </tr>
          </thead>
          <tbody>
            {ALL_EVENTS.map((e) => (
              <tr key={`${e.platform}-${e.name}`} className="border-t border-border/40">
                <td className="py-1.5">{e.platform}</td>
                <td>
                  <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">{e.name}</code>
                </td>
                <td>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1", STATUS_TONE[e.status])}>
                    {STATUS_LABEL[e.status]}
                  </span>
                </td>
                <td className="text-muted-foreground">{e.creates}</td>
                <td>{e.requiresApproval ? "yes" : "no"}</td>
                <td>{e.sensitive ? "yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CallbackRegistryTable() {
  return (
    <section className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <h2 className="text-sm font-semibold">Callback registry</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        What Echo is allowed to call back on other platforms. Everything is planned and requires approval per call.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[11.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1">Platform</th>
              <th>Callback</th>
              <th>Status</th>
              <th>Approval</th>
              <th>Risk</th>
              <th>API key</th>
            </tr>
          </thead>
          <tbody>
            {ALL_CALLBACKS.map((c) => (
              <tr key={`${c.platform}-${c.name}`} className="border-t border-border/40">
                <td className="py-1.5">{c.platform}</td>
                <td>
                  <code className="rounded bg-background/60 px-1 py-0.5 ring-1 ring-border/40">{c.name}</code>
                </td>
                <td>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1", STATUS_TONE[c.status])}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td>{c.requiresApproval ? "yes" : "no"}</td>
                <td className="capitalize">{c.risk}</td>
                <td>{c.apiKeyRequired ? "yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdapterTemplateCard() {
  const fields = [
    "Platform name",
    "Role",
    "Status",
    "Direction",
    "Webhook URL",
    "Shared secret",
    "Allowed event names",
    "Callback endpoints",
    "API key status",
    "Approval requirement",
    "Kill switch",
    "Last event",
    "Last error",
    "Audit trail",
    "Owner/manager role",
    "Notes",
  ];
  return (
    <section className="rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <h2 className="text-sm font-semibold">Future adapter template</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Any future platform needs these fields to plug into Metro Echo. Signed events come in. Echo drafts. You approve. Then anything moves.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-1 text-[11.5px] text-muted-foreground md:grid-cols-2">
        {fields.map((f) => (
          <li key={f} className="rounded-md bg-background/40 px-2 py-1 ring-1 ring-border/40">
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
