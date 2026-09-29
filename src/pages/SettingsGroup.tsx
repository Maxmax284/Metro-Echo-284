import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { findSettingsGroup, resolveSettingsGroupId } from "@/lib/settingsGroups";

/** One category of the control room, on its own page with a way back. */
export default function SettingsGroup() {
  const { groupId } = useParams();
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const group = findSettingsGroup(groupId);

  /* Merged groups keep their old doors: /settings/g/calendar lands on
     /settings/g/time, /settings/g/spending on /settings/g/records. */
  const resolved = resolveSettingsGroupId(groupId);
  if (resolved && resolved !== groupId) {
    return <Navigate to={`/settings/g/${resolved}`} replace />;
  }

  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;
  if (isOwner === null) return <div className="p-8 text-sm text-muted-foreground">Loading control room…</div>;
  if (!isOwner) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Owner-only area. You don't have access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/settings"
          aria-label="Back to the control room"
          className="vanta-focus inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{group?.title ?? "Not here"}</h1>
          <p className="text-xs text-muted-foreground">
            {group?.blurb ?? "That part of the control room doesn't exist."}
          </p>
        </div>
      </header>

      {group ? (
        group.render()
      ) : (
        <Link to="/settings" className="text-[12px] text-primary underline">
          Back to the control room
        </Link>
      )}
    </div>
  );
}
