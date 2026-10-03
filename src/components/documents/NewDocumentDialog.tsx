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
import { AudioLines, ChevronLeft, FilePlus2, Loader2, NotebookPen, Sparkles } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_TEMPLATES, DRAFT_TONES, getTemplate,
  type DocumentTemplate, type DraftTone, type TemplateField,
} from "@/lib/documentTemplates";
import { createDraftDocument, parseIntakeBrief, runDraft } from "@/lib/documents";
import { DictateButton } from "@/components/ui/dictate-button";
import { MeetingNotesDraftForm } from "@/components/documents/MeetingNotesDraftForm";

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
  /** One-breath intake: the whole brief in one box, sorted into fields on tap. */
  const [brief, setBrief] = useState("");
  const [parsing, setParsing] = useState(false);
  /** Guided intake asks one thing at a time; "all" shows the classic form. */
  const [mode, setMode] = useState<"guided" | "all">("guided");
  const [step, setStep] = useState(0);
  const [sourceMode, setSourceMode] = useState<"templates" | "meeting_notes">("templates");

  const template = useMemo(() => getTemplate(templateKey), [templateKey]);

  /* Multi-turn intake: title, each template field, voice, then a read-back.
     Deterministic — Echo asks for what it does not have, in order, and never
     calls a model to decide what to ask. */
  const steps = useMemo(() => {
    if (!template) return [] as IntakeStep[];
    return [
      { key: "__title", label: "What should we call this internally?", kind: "title" as const },
      ...template.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: "field" as const,
        field: f,
      })),
      { key: "__tone", label: "What voice should it be written in?", kind: "tone" as const },
      { key: "__review", label: "Read it back before Echo drafts", kind: "review" as const },
    ];
  }, [template]);

  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))];
  const answeredCount = template
    ? template.fields.filter((f) => (inputs[f.key] ?? "").trim().length > 0).length
    : 0;
  const stepBlocked =
    current?.kind === "field" && !!current.field?.required && !(inputs[current.field.key] ?? "").trim();

  function reset() {
    setTemplateKey(null);
    setInputs({});
    setTitle("");
    setTone("warm");
    setMode("guided");
    setStep(0);
    setSourceMode("templates");
    setBrief("");
    setParsing(false);
  }

  /**
   * One-breath intake: the person says the whole brief, Echo sorts it into a
   * template and its fields, and the dialog opens on the read-back step.
   * Nothing is created and nothing drafts until the person taps Draft.
   */
  async function handleSortIntoFields() {
    const text = brief.trim();
    if (text.length < 20 || parsing) return;
    setParsing(true);
    const res = await parseIntakeBrief(text);
    setParsing(false);
    const parsed = res.ok ? res.parsed : undefined;
    const chosen = parsed ? getTemplate(parsed.template_key) : undefined;
    if (!parsed || !chosen) {
      if (res.error === "rate_limited") toast.error("Over rate limit. Try again in a minute.");
      else if (res.error === "budget_exceeded") toast.error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      else if (res.error === "no_match" || parsed) toast.error("Echo couldn't place that brief — pick a template yourself below.");
      else toast.error("Echo couldn't sort that — try again, or pick a template below.");
      return;
    }
    setTemplateKey(chosen.key);
    setTitle(parsed.title);
    setInputs(parsed.inputs);
    if (parsed.tone) setTone(parsed.tone);
    setMode("guided");
    // steps = title + fields + tone + read-back — land on the read-back.
    setStep(1 + chosen.fields.length + 1);
    toast.success("Sorted — read it back before Echo drafts.");
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
            {sourceMode === "meeting_notes" ? "From meeting notes" : template ? template.label : "New document"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {sourceMode === "meeting_notes"
              ? "Choose the notes and receipts Echo is allowed to use."
              : template
              ? template.longDescription
              : "Pick a template. Echo drafts it in plain English. You decide what to do with it."}
          </DialogDescription>
        </DialogHeader>

        {sourceMode === "meeting_notes" ? (
          <MeetingNotesDraftForm
            projectId={projectId}
            organizationId={organizationId}
            onBack={() => setSourceMode("templates")}
            onCreated={(id) => { onCreated?.(id); handleClose(false); }}
          />
        ) : !template ? (
          <ul className="mt-2 space-y-2">
            <li className="vanta-inset px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <AudioLines className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-medium">Say it in one breath</p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Talk or type the whole brief — parties, money, dates, tone. Echo sorts it into the right template and fields, then reads it back. You still tap Draft.
              </p>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="SOW for Kru Glitch — 3-month trial, 20 hours a week, $2,500 a month, 48-hour termination…"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <DictateButton
                  value={brief}
                  onChange={setBrief}
                  label="Dictate the brief"
                />
                <button
                  type="button"
                  disabled={brief.trim().length < 20 || parsing}
                  onClick={() => void handleSortIntoFields()}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-md bg-primary/10 px-3 text-sm font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/15 disabled:opacity-40"
                >
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {parsing ? "Sorting…" : "Sort it into fields"}
                </button>
              </div>
            </li>
            <li>
              <p className="pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                …or start from
              </p>
              <button
                type="button"
                onClick={() => setSourceMode("meeting_notes")}
                className="flex w-full items-start gap-3 rounded-lg border border-primary/35 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
              >
                <NotebookPen className="mt-0.5 h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">From meeting notes</span>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">Choose a meeting brief or follow-up memo, then pick the notes and receipts Echo may use.</p>
                </div>
              </button>
            </li>
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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => { setTemplateKey(null); setStep(0); }}
                disabled={submitting}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back to templates
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs text-primary"
                onClick={() => setMode(mode === "guided" ? "all" : "guided")}
                disabled={submitting}
              >
                {mode === "guided" ? "Show all fields" : "One question at a time"}
              </Button>
            </div>

            {mode === "guided" ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    Question {Math.min(step + 1, steps.length)} of {steps.length}
                  </p>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none"
                      style={{ width: `${((step + 1) / Math.max(steps.length, 1)) * 100}%` }}
                    />
                  </div>
                </div>

                {current?.kind === "review" ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Read it back</p>
                    <ul className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2.5 text-[11.5px]">
                      <li className="flex gap-2">
                        <span className="w-28 shrink-0 text-muted-foreground">Title</span>
                        <span className="min-w-0 flex-1 break-words">
                          {title.trim() || `${template.label} — draft`}
                        </span>
                      </li>
                      {template.fields.map((f) => (
                        <li key={f.key} className="flex gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">{f.label}</span>
                          <span className="min-w-0 flex-1 break-words">
                            {(inputs[f.key] ?? "").trim() || (
                              <span className="italic text-muted-foreground">
                                {f.required ? "still needed" : "left out"}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                      <li className="flex gap-2">
                        <span className="w-28 shrink-0 text-muted-foreground">Voice</span>
                        <span className="min-w-0 flex-1">
                          {DRAFT_TONES.find((t) => t.value === tone)?.label}
                        </span>
                      </li>
                    </ul>
                    {missingRequired(template).length > 0 ? (
                      <p className="text-[11px] text-destructive">
                        Echo still needs: {missingRequired(template).join(", ")}.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {answeredCount} of {template.fields.length} answered. Anything left out is written as
                        “to be supplied” so you can see the gap in the draft.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`step-${current?.key}`} className="text-sm font-medium">
                      {current?.kind === "field"
                        ? `${current.field!.label}${current.field!.required ? " *" : ""}`
                        : current?.label}
                    </Label>
                    {current?.kind === "title" ? (
                      <Input
                        id={`step-${current.key}`}
                        placeholder={`${template.label} — draft`}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-9 text-sm"
                      />
                    ) : current?.kind === "tone" ? (
                      <Select value={tone} onValueChange={(v) => setTone(v as DraftTone)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DRAFT_TONES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : current?.kind === "field" ? (
                      <FieldControl
                        field={current.field!}
                        value={inputs[current.field!.key] ?? ""}
                        onChange={(v) => setField(current.field!.key, v)}
                      />
                    ) : null}
                    {current?.kind === "field" && current.field?.helper ? (
                      <p className="text-[10.5px] text-muted-foreground">{current.field.helper}</p>
                    ) : null}
                    {current?.kind === "title" ? (
                      <p className="text-[10.5px] text-muted-foreground">
                        Only you see this. It names the draft in your list.
                      </p>
                    ) : null}
                    {current?.kind === "field" && !current.field?.required ? (
                      <p className="text-[10.5px] text-muted-foreground">
                        Optional — skip it and the draft says “to be supplied”.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-h-[36px] text-xs"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={submitting || step === 0}
                  >
                    Back
                  </Button>
                  {current?.kind === "review" ? (
                    <Button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="ml-auto h-9 min-h-[36px] flex-1 gap-1.5 text-xs"
                    >
                      {submitting
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Sparkles className="h-4 w-4" />}
                      Draft document
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="ml-auto h-9 min-h-[36px] flex-1 text-xs"
                      onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                      disabled={submitting || stepBlocked}
                    >
                      {stepBlocked ? "Needed to continue" : "Next"}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
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
                    <FieldControl
                      field={f}
                      value={inputs[f.key] ?? ""}
                      onChange={(v) => setField(f.key, v)}
                    />
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

                <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-1.5">
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Sparkles className="h-4 w-4" />}
                  Draft document
                </Button>
              </div>
            )}

            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Echo drafts this. You review it. It is not legal advice. Nothing is sent anywhere —
              the draft lands in Documents and the run appears in Receipts.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type IntakeStep = {
  key: string;
  label: string;
  kind: "title" | "field" | "tone" | "review";
  field?: TemplateField;
};

/** One control per template field kind. Shared by guided and all-fields modes. */
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === "textarea") {
    return (
      <div className="space-y-1.5">
        <Textarea
          id={`f-${field.key}`}
          rows={3}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
        {/* Longer answers are the ones worth speaking. */}
        <DictateButton value={value} onChange={onChange} label="Speak the answer" />
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={`f-${field.key}`}
      type={field.kind === "date" ? "date" : "text"}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 text-sm"
    />
  );
}
