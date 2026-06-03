// WorkspaceSwitcher — picks active scope (Personal / a workspace / Admin).
// Hides itself when the user only has Personal so we don't show empty UI.
import { Check, ChevronsUpDown, Building2, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useWorkspace, scopeLabel, type Membership } from "@/providers/WorkspaceProvider";
import { useRole } from "@/hooks/useRole";

export function WorkspaceSwitcher() {
  const { memberships, scope, activeMembership, setScope, loading } = useWorkspace();
  const role = useRole();
  const [open, setOpen] = useState(false);

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
          className="h-7 max-w-[180px] gap-1 px-2 text-[11px] font-normal"
          aria-label="Switch workspace"
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
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
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted/40",
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
