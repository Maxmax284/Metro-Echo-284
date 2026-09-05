// WorkspaceSwitcher — picks active scope (Personal / a workspace / Admin).
// Hides itself when the user only has Personal so we don't show empty UI.
//
// Scope is an operational boundary, not a filter chip. When it changes, the
// trigger acknowledges the switch once while scoped data refetches, then goes
// quiet again. No per-workspace recolouring of the app.
import { Check, ChevronsUpDown, Building2, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MOTION_MICRO, MOTION_PRESS, MOTION_SIGNAL } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";
import { useWorkspace, scopeLabel, type Membership } from "@/providers/WorkspaceProvider";
import { useRole } from "@/hooks/useRole";
import { feelMs } from "@/lib/motion";

export function WorkspaceSwitcher() {
  const { memberships, scope, activeMembership, setScope, loading } = useWorkspace();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const scopeKey = `${scope.kind}:${scope.kind === "workspace" ? scope.organization_id : ""}`;
  const lastScope = useRef(scopeKey);

  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    setSwitching(true);
    const t = window.setTimeout(() => setSwitching(false), feelMs(900, { min: 200 }));
    return () => window.clearTimeout(t);
  }, [scopeKey]);

  // Personal-only users: no switcher noise.
  if (loading) return null;
  if (memberships.length === 0 && role !== "owner") return null;

  const label = scopeLabel(scope, activeMembership);
  const Icon = scope.kind === "admin" ? Shield : scope.kind === "workspace" ? Building2 : User;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-7 max-w-[200px] gap-1 px-2 text-[11px] font-normal",
            MOTION_MICRO,
            MOTION_PRESS,
            /* Echo changed rooms: one purple sweep across the scope label
               while scoped data refetches, then quiet again. */
            switching && `text-accent ${MOTION_SIGNAL}`,
          )}
          aria-label="Switch workspace"
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
          {switching ? (
            <span className="shrink-0 text-[10.5px] text-accent" aria-live="polite">
              · refreshing
            </span>
          ) : null}
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>


      <PopoverContent align="end" className="w-[260px] p-1.5">
        <ScopeRow
          active={scope.kind === "personal"}
          icon={<User className="h-3.5 w-3.5" />}
          label="Personal"
          sub="Your private space"
          onClick={() => { setScope({ kind: "personal" }); setOpen(false); }}
        />
        {memberships.length > 0 && (
          <div className="my-1 border-t border-border/40" />
        )}
        {memberships.map((m) => (
          <ScopeRow
            key={m.organization_id}
            active={scope.kind === "workspace" && scope.organization_id === m.organization_id}
            icon={<Building2 className="h-3.5 w-3.5" />}
            label={m.name}
            sub={roleSub(m)}
            onClick={() => {
              setScope({ kind: "workspace", organization_id: m.organization_id });
              setOpen(false);
            }}
          />
        ))}
        {role === "owner" && (
          <>
            <div className="my-1 border-t border-border/40" />
            <ScopeRow
              active={scope.kind === "admin"}
              icon={<Shield className="h-3.5 w-3.5" />}
              label="Admin"
              sub="Platform-wide controls"
              onClick={() => { setScope({ kind: "admin" }); setOpen(false); }}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ScopeRow({
  active, icon, label, sub, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] w-full items-start gap-2 rounded-md px-2 py-2 text-left text-[12px] hover:bg-muted/40",
        MOTION_MICRO,
        MOTION_PRESS,
        active && "bg-muted/30",
      )}

    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{label}</span>
        <span className="block truncate text-[10.5px] text-muted-foreground">{sub}</span>
      </span>
      {active && <Check className="mt-0.5 h-3.5 w-3.5 text-primary" />}
    </button>
  );
}

function roleSub(m: Membership): string {
  switch (m.role) {
    case "owner_admin": return "Owner · full access";
    case "manager": return "Manager";
    case "viewer": return "Viewer · read-only";
    default: return "Member";
  }
}
