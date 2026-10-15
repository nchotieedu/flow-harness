# PLAN — Rebuilding Flow on a self-built harness

## Goal

Rebuild the essence of **Flow** (six AI agents running as a self-directing company)
on top of a **mini agent runtime we build ourselves** — starting from the
**complete harness** the Harness Engineering course ends with, not lesson by lesson.

> Mantra: **agent systems are workflow systems.** The LLM decides the next
> semantic step; the harness owns execution.

## Starting point: the complete course harness

Reference implementation: `Harness-engineering` repo, branch `complete`
(~830 lines). What the final form gives us, for free:

| Module | Final-takeaway mechanism |
|---|---|
| `runtime.ts` | The spine: `runWorkflow` → model turn → tool steps, `MAX_STEPS`, approval gate on dangerous tools |
| DBOS | Durable workflows: exactly-once tool steps, checkpoint/resume, `kill -9` survival, suspend/resume |
| `bus.ts` + `db.ts` | Durable event log (Drizzle/Postgres, JSONB rows) — replayable timeline |
| `agents.ts` | `Agent` type: name, system prompt, tool surface; triage agent routes to specialists |
| `memory.ts` | Context hydration with token budget (`MAX_CONTEXT_TOKENS`), summarization |
| `sandbox.ts` | `runInSandbox` — tools execute behind a policy boundary |
| `supervisor.ts` | Registered DBOS workflow: fan-out to sub-agents, fan-in aggregation |
| `tools.ts` | Safe/dangerous tool split with `NEEDS_APPROVAL` set |

Flow's own architecture (scheduler, guardrails G1–G8, charter-compiled prompts,
SQLite memory, escalations) is the **domain** we pour into this runtime.

## Stack (same as the final harness)

- Node.js + TypeScript, run with `tsx` (no build step)
- Vercel AI SDK (`streamText`), server-side only
- **DBOS SDK** for durable workflow execution (replaces hand-rolled StateStore)
- Postgres + Drizzle for the durable event log (local Postgres or Neon — Flow used SQLite; DBOS needs Postgres, that's the tradeoff)
- Express + one WebSocket; inspector as pure projection of the event stream

## Build order — vertical phases, one `main`

No lesson branches. Each phase ends with a working demo.

### P1 — Port the skeleton
Copy the complete harness modules into `flow-harness`, strip the course domain
(billing/refund/triage-as-is), keep the spine green: `npm run typecheck` passes,
one fake work item flows end-to-end, events land in the durable log.

### P2 — Flow domain model
- Six agents from Flow's org: `ceo`, `product`, `tech`, `growth`, `ops`, `quality` —
  each an `Agent` with its own charter slice as system prompt.
- Tables: `work_items`, `objectives`, `messages` (sender, recipient, priority).
- **Done:** CEO agent processes one work item against the durable log.

### P3 — Routing & handoffs
Replace the triage agent with Flow's org routing: CEO assigns work items to
departments (`assignWorkItem` handoff); `priority: critical` messages wake the
recipient immediately (scheduler triggers → `runWorkflow` resume).
- **Done:** work item hops CEO → tech → done with a full message trail.

### P4 — Hierarchical supervision
Adapt `runSupervisorWorkflow`: CEO fans out an objective to department agents in
parallel, `quality` reviews each result, supervisor aggregates before fan-in.
- **Done:** one objective fanned out to 3 departments, reviewed, aggregated.

### P5 — Sandbox & policy
Rebuild Flow's guardrails on `runInSandbox` + per-role tool access:
`publishProduct`, `spendBudget` are CEO-only and dangerous; blocked calls log
incidents. Tools: `readInbox`, `updateObjective`, `assignWorkItem`, `sendMessage`,
`draftProduct` (safe) / `publishProduct`, `spendBudget` (dangerous).
- **Done:** non-CEO `publishProduct` blocked and logged as an incident.

### P6 — Human in the loop
`NEEDS_APPROVAL = { publishProduct, spendBudget }` → DBOS suspend; human
approves/rejects via dashboard (or CLI first); resume — possibly days later.
Mirrors Flow's human protocol: governance through escalations, not management.
- **Done:** `spendBudget` suspends; approve → resumes; reject → clean, logged failure.

### P7 — Inspector
Port the course's `web/` inspector: step timeline, agent tree, approval modal —
reading only from the durable event log.

## Non-goals (for now)

- No real external adapters (publishing, payments) — everything fake-but-realistic.
- No vertical product — the company scenario stays deliberately boring.
- Charter is a reduced set of slices, not the full six-document Flow charter.
