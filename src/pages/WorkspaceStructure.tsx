// WorkspaceStructure — /settings/workspaces hub.
// List every workspace the user owns or belongs to, create new ones,
// edit identity (name / type / slug / appearance), and manage members.
// Branding stays small on purpose: short code + accent HSL + logo URL.
// The shell stays Vanta-calm; the accent is a seam, not a re-skin.
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Building2, Users, Trash2, Loader2, UserPlus, RefreshCw,
  Plus, Palette, Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace, type WorkspaceRole } from "@/providers/WorkspaceProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";

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
  short_code: string | null;
  accent_hsl: string | null;
  logo_url: string | null;
};

const ROLES: WorkspaceRole[] = ["owner_admin", "manager", "member", "viewer"];
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner_admin: "Owner",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

const WORKSPACE_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
  { value: "property_ops", label: "Property ops" },
  { value: "gym_ops", label: "Gym ops" },
  { value: "security_ops", label: "Security ops" },
] as const;

// Normalize a slug to lowercase + hyphens. Used by both create and edit flows
// so the URL-shaped identifier never drifts from what the user typed.
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export default function WorkspaceStructure() {
  const { session } = useAuth();
  const { refresh: refreshMemberships } = useWorkspace();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, Member[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const ownedOrgs = useMemo(
    () => orgs.filter((o) => o.owner_id === session?.user.id),
    [orgs, session],
  );

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, name, slug, type, owner_id, short_code, accent_hsl, logo_url");
    const list = (orgRows ?? []) as OrgRow[];
    setOrgs(list);

    const owned = list.filter((o) => o.owner_id === session.user.id);
    if (owned.length === 0) { setMembersByOrg({}); setLoading(false); return; }

    const ids = owned.map((o) => o.id);
    const { data: mems } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status, accepted_at")
      .in("organization_id", ids);

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

  const createWorkspace = async (name: string, type: string) => {
    if (!session) return;
    const cleanName = name.trim();
    if (!cleanName) { toast.error("Name it first"); return; }
    setCreating(true);
    const baseSlug = slugify(cleanName) || "workspace";
    // Append a short random suffix so concurrent users picking the same name don't collide.
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: cleanName,
        type,
        kind: type === "personal" ? "personal" : "business",
        slug,
        owner_id: session.user.id,
      })
      .select("id")
      .single();
    if (error || !data) { setCreating(false); toast.fromError(error ?? new Error("Create failed")); return; }
    // Owner row so the creator immediately shows up as owner_admin in the switcher.
    const { error: memErr } = await supabase.from("organization_members").insert({
      organization_id: data.id,
      user_id: session.user.id,
      role: "owner_admin",
      status: "active",
      accepted_at: new Date().toISOString(),
    });
    setCreating(false);
    if (memErr) { toast.fromError(memErr); return; }
    toast.success("Workspace created");
    await refresh();
    await refreshMemberships();
  };

  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/settings" className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-semibold">Workspaces & branding</h1>
          <p className="text-xs text-muted-foreground">Lanes you operate in. Each can carry its own accent and short code.</p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-[11px]" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </header>

      <NewWorkspaceCard onCreate={createWorkspace} working={creating} />

      {loading && ownedOrgs.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}

      <div className="mt-4 space-y-4">
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

function NewWorkspaceCard({
  onCreate, working,
}: { onCreate: (name: string, type: string) => Promise<void>; working: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("business");

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" className="h-8 gap-1 text-[12px]">
        <Plus className="h-3.5 w-3.5" /> New workspace
      </Button>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Plus className="h-3 w-3" /> New workspace
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lamai Muay Thai"
            className="h-8 text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORKSPACE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-8 text-[12px]" disabled={working} onClick={async () => {
          await onCreate(name, type);
          setName(""); setType("business"); setOpen(false);
        }}>
          {working ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        You become the owner_admin. You can rename, re-type, and customize branding after creation.
      </p>
    </Card>
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

  // Identity + branding drafts. Initialised from server, only saved on Save.
  const [name, setName] = useState(org.name);
  const [type, setType] = useState(org.type);
  const [slug, setSlug] = useState(org.slug);
  const [shortCode, setShortCode] = useState(org.short_code ?? "");
  const [accentHsl, setAccentHsl] = useState(org.accent_hsl ?? "");
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? "");
  const [savingIdentity, setSavingIdentity] = useState(false);

  const identityDirty =
    name !== org.name ||
    type !== org.type ||
    slug !== org.slug ||
    (shortCode || null) !== (org.short_code ?? null) ||
    (accentHsl || null) !== (org.accent_hsl ?? null) ||
    (logoUrl || null) !== (org.logo_url ?? null);

  const accentValid = !accentHsl || /^\s*\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\s*$/.test(accentHsl);
  const shortValid = !shortCode || (shortCode.length >= 2 && shortCode.length <= 6);

  const saveIdentity = async () => {
    if (!accentValid) { toast.error("Accent must look like '212 95% 60%'"); return; }
    if (!shortValid) { toast.error("Short code is 2–6 characters"); return; }
    const cleanSlug = slugify(slug) || org.slug;
    setSavingIdentity(true);
    const { error } = await supabase.from("organizations").update({
      name: name.trim() || org.name,
      type,
      slug: cleanSlug,
      short_code: shortCode.trim() || null,
      accent_hsl: accentHsl.trim() || null,
      logo_url: logoUrl.trim() || null,
    }).eq("id", org.id);
    setSavingIdentity(false);
    if (error) { toast.fromError(error); return; }
    setSlug(cleanSlug);
    toast.success("Workspace updated");
    await onChanged();
  };

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

  // Preview swatch — uses the saved/draft HSL as a real color so the user sees
  // what the switcher seam will look like before they commit.
  const accentStyle = accentHsl && accentValid
    ? { backgroundColor: `hsl(${accentHsl})` }
    : undefined;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mt-0.5 h-6 w-6 rounded object-cover ring-1 ring-border/60" />
        ) : (
          <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold truncate">{org.name}</h2>
            <Badge variant="outline" className="text-[9.5px] uppercase tracking-wider">{org.type}</Badge>
            {org.short_code && (
              <Badge
                className="text-[9.5px] uppercase tracking-wider text-white border-transparent"
                style={accentStyle}
              >
                {org.short_code}
              </Badge>
            )}
            <span className="text-[10.5px] text-muted-foreground">/{org.slug}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Users className="h-3 w-3" /> {members.length}
        </span>
      </div>

      {/* Identity + appearance */}
      <div className="space-y-3 rounded-md border border-border/50 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3 w-3" /> Identity & appearance
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORKSPACE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8 text-[12px] font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Short code (2–6)</Label>
            <Input
              value={shortCode}
              onChange={(e) => setShortCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="GTH"
              className="h-8 text-[12px] font-mono uppercase"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Accent (HSL triplet)</Label>
            <div className="flex items-center gap-2">
              <Input
                value={accentHsl}
                onChange={(e) => setAccentHsl(e.target.value)}
                placeholder="212 95% 60%"
                className="h-8 flex-1 text-[12px] font-mono"
              />
              <span
                className="h-8 w-8 shrink-0 rounded-md ring-1 ring-border/60"
                style={accentStyle ?? { backgroundColor: "hsl(var(--muted))" }}
                aria-label="Accent preview"
              />
            </div>
            {!accentValid && (
              <p className="text-[10.5px] text-destructive">Format: hue saturation% lightness% — e.g. 212 95% 60%</p>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Logo URL</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className="h-8 text-[12px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1 text-[12px]"
            onClick={saveIdentity}
            disabled={!identityDirty || savingIdentity}
          >
            {savingIdentity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          {identityDirty && (
            <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => {
              setName(org.name); setType(org.type); setSlug(org.slug);
              setShortCode(org.short_code ?? ""); setAccentHsl(org.accent_hsl ?? "");
              setLogoUrl(org.logo_url ?? "");
            }}>
              Revert
            </Button>
          )}
        </div>
      </div>

      {/* Members */}
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
        <SurfaceAftermath surface="workspace" />
      </div>
    </Card>
  );
}
