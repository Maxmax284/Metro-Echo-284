import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, Receipt, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { createDraftDocument, runDraft, type DraftEvidenceRef } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vantaToast as toast } from "@/lib/vantaVoice";

type NoteChoice = { id: string; title: string; created_at: string; tags: string[] | null };
type ReceiptChoice = { id: string; event: string; created_at: string; entity_type: string | null };

export function MeetingNotesDraftForm({
  projectId,
  organizationId,
  onCreated,
  onBack,
}: {
  projectId?: string | null;
  organizationId?: string | null;
  onCreated?: (documentId: string) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [notes, setNotes] = useState<NoteChoice[]>([]);
  const [receipts, setReceipts] = useState<ReceiptChoice[]>([]);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [receiptIds, setReceiptIds] = useState<string[]>([]);
  const [formatKind, setFormatKind] = useState<"meeting_brief" | "follow_up_memo">("meeting_brief");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    void Promise.all([
      applyScope(supabase.from("notes").select("id,title,created_at,tags"))
        .order("created_at", { ascending: false }).limit(30),
      applyScope(supabase.from("audit_log").select("id,event,created_at,entity_type"))
        .order("created_at", { ascending: false }).limit(30),
    ]).then(([noteResult, receiptResult]) => {
      setNotes((noteResult.data ?? []) as NoteChoice[]);
      setReceipts((receiptResult.data ?? []) as ReceiptChoice[]);
      setLoading(false);
    });
  }, [user, scopeKey, applyScope]);

  const chosen = useMemo<DraftEvidenceRef[]>(() => [
    ...notes.filter((row) => noteIds.includes(row.id)).map((row) => ({
      kind: "note" as const, id: row.id, label: row.title || "Untitled note", recordedAt: row.created_at,
    })),
    ...receipts.filter((row) => receiptIds.includes(row.id)).map((row) => ({
      kind: "receipt" as const, id: row.id, label: row.event.replace(/[._]/g, " "), recordedAt: row.created_at,
    })),
  ], [notes, receipts, noteIds, receiptIds]);

  const toggle = (id: string, list: string[], setList: (next: string[]) => void) =>
    setList(list.includes(id) ? list.filter((value) => value !== id) : [...list, id]);

  async function submit() {
    if (!user || noteIds.length === 0) return;
    setSubmitting(true);
    try {
      const formatLabel = formatKind === "meeting_brief" ? "Meeting brief" : "Follow-up memo";
      const finalTitle = title.trim() || `${formatLabel} — ${format(new Date(), "MMM d")}`;
      const doc = await createDraftDocument({
        userId: user.id,
        title: finalTitle,
        kind: "other",
        templateKey: formatKind,
        inputs: { evidence: chosen, draft_format: formatKind },
        tone: "warm",
        projectId: projectId ?? null,
        organizationId: organizationId ?? null,
      });
      const result = await runDraft({
        documentId: doc.id,
        templateTitle: formatLabel,
        userMessage: `Create a ${formatLabel.toLowerCase()} from the selected evidence.`,
        evidence: chosen,
        draftFormat: formatKind,
      });
      if (!result.ok) throw new Error(result.error || "Couldn't finish the draft.");
      toast.success({ title: "Draft ready to review", description: "The notes and receipts used are attached to it." });
      onCreated?.(doc.id);
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" aria-label="Draft format">
        {(["meeting_brief", "follow_up_memo"] as const).map((value) => (
          <Button key={value} type="button" variant={formatKind === value ? "default" : "outline"}
            className="h-auto min-h-12 whitespace-normal px-3 py-2 text-left" onClick={() => setFormatKind(value)}>
            {value === "meeting_brief" ? "Meeting brief" : "Follow-up memo"}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evidence-title">Internal title</Label>
        <Input id="evidence-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Echo can name it from the format and date" />
      </div>
      <EvidenceList title="Notes used" icon={<FileText className="h-3.5 w-3.5" />} empty="Capture or save meeting notes first. They will appear here."
        rows={notes.map((row) => ({ id: row.id, label: row.title || "Untitled note", at: row.created_at }))}
        selected={noteIds} onToggle={(id) => toggle(id, noteIds, setNoteIds)} />
      <EvidenceList title="Receipts used" icon={<Receipt className="h-3.5 w-3.5" />} empty="No recent receipts in this room. They are optional."
        rows={receipts.map((row) => ({ id: row.id, label: row.event.replace(/[._]/g, " "), at: row.created_at }))}
        selected={receiptIds} onToggle={(id) => toggle(id, receiptIds, setReceiptIds)} />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {noteIds.length} note{noteIds.length === 1 ? "" : "s"} and {receiptIds.length} receipt{receiptIds.length === 1 ? "" : "s"} selected. Echo uses only these sources and marks gaps “to be supplied.”
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>Back</Button>
        <Button type="button" className="flex-1 gap-1.5" onClick={submit} disabled={submitting || noteIds.length === 0}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {noteIds.length === 0 ? "Choose a note" : "Draft from evidence"}
        </Button>
      </div>
    </div>
  );
}

function EvidenceList({ title, icon, empty, rows, selected, onToggle }: {
  title: string; icon: React.ReactNode; empty: string;
  rows: Array<{ id: string; label: string; at: string }>;
  selected: string[]; onToggle: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{icon}{title}</div>
      {rows.length === 0 ? <p className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">{empty}</p> : (
        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          {rows.map((row) => (
            <label key={row.id} className="flex min-h-12 cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2.5">
              <Checkbox checked={selected.includes(row.id)} onCheckedChange={() => onToggle(row.id)} aria-label={`Use ${row.label}`} />
              <span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium">{row.label}</span><span className="text-[10px] text-muted-foreground">{format(new Date(row.at), "MMM d, yyyy · h:mm a")}</span></span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}