// DocumentsStation — the Documents desk's post on the main Work shelf.
//
// The desk itself lives at /documents; this station keeps it visible where
// work already lands: what's in review, and the two ways in — Analyze a
// document you have, or draft a new one. Empty is a taught state, not a
// hidden one: the station stays on the shelf so the desk is discoverable
// before the first document exists.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, FilePlus2, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import { listAllDocuments, statusLabel, type DocumentRow } from "@/lib/documents";

const SHOWN = 3;

export function DocumentsStation() {
  const { user } = useAuth();
  const orgId = useActiveOrgId();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listAllDocuments({ organizationId: orgId ?? undefined })
      .then((rows) => { if (alive) setDocs(rows); })
      .catch(() => { if (alive) setDocs([]); });
    return () => { alive = false; };
  }, [user, orgId]);

  if (!user) return null;
  const recent = (docs ?? []).slice(0, SHOWN);
  const loading = docs === null;

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">Documents</h3>
        <button
          onClick={() => navigate("/documents")}
          className="ml-auto min-h-[36px] text-xs text-primary hover:underline"
        >
          All documents
        </button>
      </div>

      {loading ? null : recent.length === 0 ? (
        <p className="mt-2 vanta-inset px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          No documents yet. Analyze a contract or invoice you have, or draft a new one from a template — Echo reads it and you decide.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {recent.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => navigate(`/documents?document=${d.id}`)}
                className="block w-full text-left vanta-inset px-3 py-2 transition-colors hover:bg-surface-elevated"
              >
                <span className="block truncate text-xs font-medium">{d.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {statusLabel(d.status)}
                  {" · "}
                  {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={() => navigate("/documents?analyze=1")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-primary/10 px-2.5 text-[11.5px] font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/15"
        >
          <FileSearch className="h-3 w-3" /> Analyze document
        </button>
        <button
          onClick={() => navigate("/documents?new=1")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2.5 text-[11.5px] text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          <FilePlus2 className="h-3 w-3" /> New document
        </button>
      </div>
    </div>
  );
}
