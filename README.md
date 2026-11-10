# Metro Echo
### A situational companion for everyday life

**Metro Echo** is a personal-context application that brings together information scattered across everyday tools — calendars, email, files, travel plans, commitments, and ongoing projects — and helps someone see what actually deserves attention.

**Metro Echo is the platform. Echo is the intelligence inside it.**

The goal is not another dashboard full of notifications. It is a calm, context-aware system that can explain **what matters, what changed, what needs approval, and what can wait**.

> **Project context:** This repository contains the application and its supporting backend workflows. Some features require connected accounts, provider credentials, and user consent. This README describes code present in the project, not independent verification of every live integration.

## Why it exists

A calendar knows about meetings. An inbox knows about messages. A document folder knows about files. A project tracker knows about unfinished work. None of those sources, by itself, knows how a change in one area affects the rest of the day.

Metro Echo is designed to connect those fragments into a more useful picture, without treating the user's life as a productivity-score contest.

## The four main rooms

| Room | Purpose |
| --- | --- |
| **Today** | A short, relevant picture of what deserves attention now |
| **Work** | Ongoing projects, commitments, documents, schedules, and practical work |
| **Echo** | Ask questions using available context instead of starting over every time |
| **Receipts** | Trace what was proposed, approved, changed, or completed |

The interface also contains dedicated views and supporting workflows for documents, projects, travel, watches, awareness, and connected accounts.

## What the codebase covers

- **Connected context:** Google-related mail, calendar, and Drive reading/sync workflows, with access dependent on account connection and authorization.
- **Practical intake:** Text, voice, documents, and file intake paths that turn raw input into reviewable records.
- **Commitments and projects:** Capturing tasks, following ongoing work, and relating notes or incoming information to existing records.
- **Proposed actions with a gate:** Staging consequential actions for user review, with separate transitions and execution paths.
- **Receipts and traceability:** Auditable events around actions, context, and decisions.
- **Location and travel context:** Place awareness, arrival/flight information, and route or weather lookups where supported and configured.
- **Different device surfaces:** Phone-first application UI, a reduced-information wrist/glance surface, and Telegram-related messaging support.
- **Document workflows:** Document intake, structured drafting, review, and export helpers.

These are engineering areas visible in the repository. They are not promises that an empty installation can immediately connect to every service.

## A design principle: prepare, then ask

Metro Echo is designed to help with the **next useful move**, not to silently make high-consequence choices for the user.

~~~text
Incoming context
      |
Collect and relate evidence
      |
Explain what changed
      |
Suggest or stage an action
      |
User reviews and approves where required
      |
Execute through the authorized pathway
      |
Record the outcome / receipt
~~~

The public product introduction describes this as **see, understand, prepare — then stop and ask**. A watch or glance view can surface information and defer a task; it is not intended as an unrestricted approval console.

## Architecture

~~~text
Phone / Desktop / Glance / Messaging
                  |
          React + TypeScript
                  |
      Authenticated app surfaces
                  |
        Supabase PostgreSQL
         /        |        \
    Stored     Edge Functions   Evidence / files
    context    (Deno)
                   |
     Connected services and AI workflows
                   |
          Approval and audit paths
~~~

**Primary stack:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Supabase/PostgreSQL, Deno Edge Functions, Vitest, and PWA/Capacitor-related tooling.

### Engineering details worth inspecting

- **Shared product identity:** [supabase/functions/_shared/brand.ts](supabase/functions/_shared/brand.ts) defines Metro Echo and Echo consistently.
- **Action staging:** [src/lib/actionStaging.ts](src/lib/actionStaging.ts) shares action-staging contracts with the server.
- **Connected operations:** [supabase/functions](supabase/functions) contains calendar, mail, document, awareness, and action functions.
- **Application surfaces:** [src/components/surfaces](src/components/surfaces) and [src/pages](src/pages) organize the user's different views of their context.
- **Wrist experience:** [src/pages/Glance.tsx](src/pages/Glance.tsx) deliberately restricts consequential actions.
- **Product explanation:** [src/pages/WhatIsMetroEcho.tsx](src/pages/WhatIsMetroEcho.tsx) describes the intended experience and distinguishes current capabilities from future directions.

## Explore the repository

| Location | Purpose |
| --- | --- |
| [src/pages](src/pages) | Primary application pages, public explanation, connected accounts, travel, and device views |
| [src/components](src/components) | Surfaces, document tools, briefings, scheduling, commitments, and user interaction |
| [src/lib](src/lib) | Context linking, decisions, policies, device behaviors, and domain logic |
| [src/hooks](src/hooks) | Application behavior and data access |
| [supabase/functions](supabase/functions) | Server-side ingestion, provider connections, action handling, and AI workflows |
| [supabase/migrations](supabase/migrations) | Database definitions and evolution |
| [roadmap.md](roadmap.md) | Delivered work, known gaps, and operational follow-ups |

## Local development

Metro Echo depends on a correctly configured backend and appropriate credentials and permissions for connected services. Without those, provider-backed surfaces will be limited. **Never commit tokens, private account data, or production secrets.**

~~~bash
git clone https://github.com/Maxmax284/Metro-Echo-284.git
cd Metro-Echo-284
npm install
npm run dev
~~~

The repository also defines these checks:

~~~bash
npm run lint
npm run test
npm run build
~~~

These commands are documented from package.json; they have not been freshly executed as part of this README update.

## What it does not claim

- It is **not** a general-purpose autonomous agent with unlimited authority.
- It is **not** intended to dispatch emergency services or share location silently.
- It does **not** imply continuous monitoring of everything in a user's life.
- Some wearable, connected-service, and ambient-awareness experiences are device- and permission-dependent.
- Future ideas in the product narrative are not represented here as completed integrations.

The [roadmap](roadmap.md) contains ongoing cleanup and source-status work, along with capabilities intentionally parked for later.

## Why this matters as engineering work

Metro Echo demonstrates a systems-design approach to **AI-assisted personal software**: multi-source context, data provenance, action boundaries, approval controls, different device surfaces, and a deliberately restrained user experience.

It is an exploration of how intelligent software can reduce cognitive load **without taking control away from the person using it**.

**Engineering / portfolio:** [Maxwell Wolfe on GitHub](https://github.com/Maxmax284) · [Nocturne Labs](https://nocturnelabs.dev/)

*One situation. Clearer decisions. Fewer unnecessary interruptions.*
