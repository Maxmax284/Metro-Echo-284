// NewDocumentDialog — guided template-based draft creation.
// User picks a template, fills the fields, picks a tone, taps Draft.
// We create the documents row (status='drafting'), invoke documents-draft,
// and open the DocumentDetailSheet in Draft mode.
//
// Plan → Approve → Execute: nothing happens until the user taps "Draft document".
import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FilePlus2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_TEMPLATES, DRAFT_TONES, getTemplate,
  type DocumentTemplate, type DraftTone,
} from "@/lib/documentTemplates";
import { createDraftDocument, runDraft } from "@/lib/documents";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  organizationId?: string | null;
  /** Called with new document id after successful draft creation. */
  onCreated?: (documentId: string) => void;
}

export function NewDocumentDialog({
  open, onOpenChange, projectId, organizationId, onCreated,
}: Props) {
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [tone, setTone] = useState<DraftTone>("warm");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const template = useMemo(() => getTemplate(templateKey), [templateKey]);

  function reset() {
    setTemplateKey(null);
    setInputs({});
    setTitle("");
    setTone("warm");
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function setField(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function missingRequired(t: DocumentTemplate): string[] {
    return t.fields
      .filter((f) => f.required && !inputs[f.key]?.trim())
      .map((f) => f.label);
  }

  async function handleSubmit() {
    if (!template) return;
    const missing = missingRequired(template);
    if (missing.length) {
      toast.error(`Add: ${missing.join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) throw new Error("Not signed in.");

      const finalTitle = title.trim() || `${template.label} — draft`;

      const doc = await createDraftDocument({
        userId,
        title: finalTitle,
        kind: template.documentKind,
        templateKey: template.key,
        inputs,
        tone,
        projectId: projectId ?? null,
        organizationId: organizationId ?? null,
      });

      const userMessage = template.buildUserMessage(inputs, tone);
      const r = await runDraft({
        documentId: doc.id,
        templateTitle: template.promptTitle,
        userMessage,
      });
      if (!r.ok) {
        toast.error(
          r.error === "rate_limited"
            ? "Over rate limit. Try again in a minute."
            : r.error === "credits_exhausted"
            ? "Out of drafting credits."
            : "Couldn't finish the draft. Try again.",
        );
      } else {
        toast.success("Draft ready to read.");
      }
      onCreated?.(doc.id);
      handleClose(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't create the draft.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] w-full max-w-md overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FilePlus2 className="h-4 w-4" />
            {template ? template.label : "New document"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {template
              ? template.longDescription
              : "Pick a template. Vanta drafts it in plain English. You decide what to do with it."}
          </DialogDescription>
        </DialogHeader>

        {!template ? (
          <ul className="mt-2 space-y-2">
            {DOCUMENT_TEMPLATES.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTemplateKey(t.key)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{t.label}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {t.documentKind}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {t.shortDescription}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setTemplateKey(null)}
              disabled={submitting}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back to templates
            </Button>

            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs">Internal title</Label>
              <Input
                id="doc-title"
                placeholder={`${template.label} — draft`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {template.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`f-${f.key}`} className="text-xs">
                  {f.label}{f.required ? " *" : ""}
                </Label>
                {f.kind === "textarea" ? (
                  <Textarea
                    id={`f-${f.key}`}
                    rows={3}
                    placeholder={f.placeholder}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="text-sm"
                  />
                ) : f.kind === "select" ? (
                  <Select
                    value={inputs[f.key] ?? ""}
                    onValueChange={(v) => setField(f.key, v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`f-${f.key}`}
                    type={f.kind === "date" ? "date" : "text"}
                    placeholder={f.placeholder}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}
                {f.helper && (
                  <p className="text-[10.5px] text-muted-foreground">{f.helper}</p>
                )}
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="doc-tone" className="text-xs">Voice</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as DraftTone)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_TONES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Vanta drafts this. You review it. It is not legal advice.
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-1.5">
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />}
              Draft document
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
