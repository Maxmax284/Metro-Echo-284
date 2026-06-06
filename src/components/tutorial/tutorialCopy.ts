// All tutorial strings in one place. Edit here, not in components.

export const WALKTHROUGH_SLIDES = [
  {
    title: "Welcome to Vanta",
    body: "Vanta is your operations officer. It captures what's going on, organizes it, and tells you what needs you next.",
    pill: "Start here",
  },
  {
    title: "1 · Capture lands in your Inbox",
    body: "Speak, type, drop a file — anything you capture lands in Memory. Nothing executes from a capture.",
    pill: "Inbox",
  },
  {
    title: "2 · It connects to a Project",
    body: "Vanta links each item to the right Project automatically. You can also tap Connect to… to link things by hand.",
    pill: "Projects",
  },
  {
    title: "3 · Command Center rolls it up",
    body: "Your Command Center shows what's going on, what needs you, and what changed — situations first, counts second.",
    pill: "Command Center",
  },
  {
    title: "4 · Turn it into a Brief",
    body: "Tap Create brief on any project or on the whole system to draft a shareable summary, PDF, or audio briefing.",
    pill: "Briefs",
  },
  {
    title: "5 · Every export leaves a Receipt",
    body: "Approved exports save under the project. Every state change writes a receipt so you can always trust what Vanta did.",
    pill: "Receipts",
  },
  {
    title: "You now understand Vanta",
    body: "Capture → Inbox → Project → Command Center → Brief → Receipt. That's the whole flow. You can replay this tour any time from Settings.",
    pill: "Done",
  },
] as const;

export const WHAT_IS_THIS: Record<string, string> = {
  command_center:
    "Your Command Center is where everything rolls up. It shows what's going on, what needs you, and what changed across every project.",
  project_rollup:
    "Project cards summarize each project: what changed, what needs you, and what's connected. Tap one to open its full canvas.",
  operations_briefing:
    "A plain-English shift report. What's going on right now, what needs you, and why — refreshed when the underlying data changes.",
  connect_to:
    "Connect any two things — notes, commitments, reminders, files, projects. Vanta uses these connections to surface related items everywhere else.",
  brief_composer:
    "Vanta drafts a brief from your linked items and receipts. You review the draft, then approve to export a PDF or audio briefing.",
  saved_exports:
    "Every PDF or audio briefing you've approved. Re-download any of them; each one has a receipt in the Audit log.",
  receipts:
    "Every state change writes a receipt — what happened, when, who did it. Receipts are how you trust Vanta.",
  sherlock:
    "Sherlock notices possible connections, risks, and contradictions in your captures. It never acts — it only suggests.",
  project_health:
    "Health is derived from open items, overdue work, and recent activity. It always comes with a one-line reason.",
};
