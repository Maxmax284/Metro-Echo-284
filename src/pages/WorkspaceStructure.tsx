// WorkspaceStructure — admin/owner page to manage workspace memberships.
// Direct user_id assignment (lookup by email) — no email invite flow yet.
// Owners of an org can add, change role, suspend, or remove members.
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Users, Trash2, Loader2, UserPlus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace, type WorkspaceRole } from "@/providers/WorkspaceProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { vantaToast as toast } from "@/lib/vantaVoice";

type Member = {
  id: string;
  organization_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: string;
  accepted_at: string | null;
  display_name?: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  owner_id: string;
};

const ROLES: WorkspaceRole[] = ["owner_admin", "manager", "member", "viewer"];
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner_admin: "Owner",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

export default function WorkspaceStructure() {
  const { session } = useAuth();
  const { refresh: refreshMemberships } = useWorkspace();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, Member[]>>({});
  const [loading, setLoading] = useState(true);

  const ownedOrgs = useMemo(
    () => orgs.filter((o) => o.owner_id === session?.user.id),
    [orgs, session],
  );

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    // Pull orgs the user owns (or is a member of), then memberships for the ones they own.
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, name, slug, type, owner_id");
    const list = (orgRows ?? []) as OrgRow[];
    setOrgs(list);

    const owned = list.filter((o) => o.owner_id === session.user.id);
    if (owned.length === 0) { setLoading(false); return; }

    const ids = owned.map((o) => o.id);
    const { data: mems } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status, accepted_at")
      .in("organization_id", ids);

    // Hydrate display names from profiles (best-effort; RLS may hide non-self).
    const userIds = Array.from(new Set((mems ?? []).map((m) => m.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] as any[] };
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name as string | null]));

    const grouped: Record<string, Member[]> = {};
    for (const m of (mems ?? []) as Member[]) {
      const enriched: Member = { ...m, display_name: nameById.get(m.user_id) ?? null };
      (grouped[m.organization_id] ||= []).push(enriched);
    }
    setMembersByOrg(grouped);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/settings" className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold">Workspace structure</h1>
          <p className="text-xs text-muted-foreground">Who has the keys to which room.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-[11px]" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </header>

      {loading && ownedOrgs.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!loading && ownedOrgs.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-foreground">You don't own any workspaces yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your personal workspace is private — no member management needed.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {ownedOrgs.map((org) => (
          <WorkspaceCard
            key={org.id}
            org={org}
            members={membersByOrg[org.id] ?? []}
            onChanged={async () => { await refresh(); await refreshMemberships(); }}
            currentUserId={session.user.id}
          />
        ))}
      </div>
    </div>
  );
}

function WorkspaceCard({
  org, members, onChanged, currentUserId,
}: {
  org: OrgRow;
  members: Member[];
  onChanged: () => Promise<void>;
  currentUserId: string;
}) {
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("member");
  const [working, setWorking] = useState(false);

  const addMember = async () => {
    const id = inviteUserId.trim();
    if (!id) { toast.error("Paste the user's id first"); return; }
    setWorking(true);
    const { error } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: id,
      role: inviteRole,
      status: "active",
      invited_by: currentUserId,
      accepted_at: new Date().toISOString(),
    });
    setWorking(false);
    if (error) { toast.fromError(error); return; }
    setInviteUserId("");
    toast.success("Member added");
    await onChanged();
  };

  const changeRole = async (memberId: string, role: WorkspaceRole) => {
    const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId);
    if (error) { toast.fromError(error); return; }
    await onChanged();
  };

  const setStatus = async (memberId: string, status: "active" | "suspended" | "removed") => {
    const patch: { status: typeof status; removed_at?: string } = { status };
    if (status === "removed") patch.removed_at = new Date().toISOString();
    const { error } = await supabase.from("organization_members").update(patch).eq("id", memberId);
    if (error) { toast.fromError(error); return; }
    await onChanged();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold truncate">{org.name}</h2>
            <Badge variant="outline" className="text-[9.5px] uppercase tracking-wider">{org.type}</Badge>
            <span className="text-[10.5px] text-muted-foreground">/{org.slug}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Users className="h-3 w-3" /> {members.length}
        </span>
      </div>

      <div className="rounded-md border border-border/50 divide-y divide-border/40">
        {members.length === 0 && (
          <p className="p-3 text-[12px] text-muted-foreground">No members yet besides the auto-provisioned owner row.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">{m.display_name || m.user_id.slice(0, 8) + "…"}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {m.status === "active" ? "Active" : m.status === "suspended" ? "Suspended" : "Removed"}
                {m.user_id === org.owner_id && " · workspace owner"}
              </div>
            </div>
            <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as WorkspaceRole)}
              disabled={m.user_id === org.owner_id}
            >
              <SelectTrigger className="h-7 w-[110px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-[12px]">{ROLE_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {m.user_id !== org.owner_id && (
              <>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                  onClick={() => setStatus(m.id, m.status === "active" ? "suspended" : "active")}
                >
                  {m.status === "active" ? "Suspend" : "Reactivate"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={() => setStatus(m.id, "removed")}
                  aria-label="Remove member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <UserPlus className="h-3 w-3" /> Add member
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="User id (uuid)"
            value={inviteUserId}
            onChange={(e) => setInviteUserId(e.target.value)}
            className="h-8 flex-1 min-w-[180px] text-[12px]"
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as WorkspaceRole)}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="text-[12px]">{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-[12px]" onClick={addMember} disabled={working}>
            {working ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground">
          Email invites are coming next. For now paste the user's id — find it in their profile or auth records.
        </p>
      </div>
    </Card>
  );
}
