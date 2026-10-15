# PLAN — Rebuilding Flow on a self-built harness

## Goal

Rebuild the essence of **Flow** (six AI agents running as a self-directing company)
on top of a **mini agent runtime we build ourselves** — the same way the
Harness Engineering course builds its harness: one persistent codebase, one
module per lesson, *the harness is the protagonist*.

> Mantra: **agent systems are workflow systems.** The LLM decides the next
> semantic step; the harness owns execution.

## What we take from Flow, what we rebuild

| Keep (the domain) | Rebuild (the runtime) |
|---|---|
| Company scenario: objectives, work items, messages, escalations | Scheduler / executor loop |
| Charter-driven prompts (mission, contracts, governance) | Durable state store + event log |
| Guardrail idea (G1–G8) | Tool policy / sandboxing |
| Shared memory with ownership & attribution | Memory + context hydration |
| Agent-to-agent messaging | Router + typed handoffs |
| CEO → department org, Quality-led review | Supervisor (fan-out / fan-in) |
| Human protocol: escalations, pause | Approval store: suspend / resume |

## The spine (every lesson fills in one line)

```ts
async function runCycle(cycleId, input) {
  const state  = await stateStore.load(cycleId);          // L2 durable
  while (!state.done) {
    const context = await hydrateContext(state);           // L4 memory
    const step    = await agent.next(context);             // LLM decides
    await policy.check(step);                              // L3 sandbox
    await eventLog.append(cycleId, step);                  // L2 durable
    const result = await executeStep(step);                // tools / handoff / approval
    await stateStore.checkpoint(cycleId, result);          // L2 durable
  }
}
```

## Milestones — one lesson, one module, one Flow mechanism

### L1 — The spine (Intro)
- `runAgent` stub filled in: single **CEO agent**, one work item, end-to-end.
- Fake-but-realistic tools: `readInbox`, `updateObjective`, `assignWorkItem`,
  `sendMessage`, `draftProduct` (safe); `publishProduct`, `spendBudget` (dangerous).
- Observation: console event stream (inspector comes later).
- **Done:** browser-independent loop; one work item processed; events logged.

### L2 — Durable execution
- `state.ts`: SQLite-backed `StateStore` (checkpoint / load / resume), append-only
  event log. Kill the process mid-cycle → resume exactly where it stopped.
- Maps to Flow's scheduler + `flow.db` (WAL).
- **Done:** crash test — `kill -9` mid-cycle, restart, cycle completes.

### L3 — Secure sandboxing
- `policies.ts`: `ToolPolicy` intercepting every tool call — per-agent tool
  access table, budget limits, publish-hook. Rebuild of Flow's guardrails.
- **Done:** `publishProduct` blocked for non-CEO agents; blocked calls logged as incidents.

### L4 — Advanced memory
- `memory.ts`: `Memory` + `ContextHydrator` — shared SQLite collections with
  ownership/attribution; context compiled per agent (constitution slice + live context).
- Maps to Flow's charter compilation + memory store.
- **Done:** two agents share a memory collection; prompt lineage stamped with charter version.

### L5 — Orchestration, routing, handoffs
- `router.ts`: `Router` + typed `Handoff` — agents message each other; work items
  route CEO → tech/growth/ops; `priority: critical` wakes the recipient immediately.
- **Done:** a work item hops CEO → tech → done, with a full message trail.

### L6 — Hierarchical supervision
- `supervisor.ts`: `Supervisor` fan-out/fan-in — CEO spawns department agents in
  parallel, Quality reviews results, supervisor aggregates.
- **Done:** one objective fanned out to 3 departments, reviewed, aggregated.

### L7 — Human in the loop
- `approvals.ts`: `ApprovalStore` — dangerous tools suspend the workflow, human
  approves/rejects via dashboard (or CLI), workflow resumes — possibly days later.
- Maps to Flow's escalations + pause controls.
- **Done:** `spendBudget` suspends; approve → resumes; reject → clean failure, logged.

## Tech stack

- **Runtime:** Node.js + TypeScript, run with `tsx` (no build step) — same as the course.
- **LLM:** OpenAI via Vercel AI SDK (`streamText`), server-side only.
- **State:** SQLite (WAL) — `better-sqlite3`.
- **Transport (later):** one WebSocket — client→server commands, server→client event stream.
- **Dashboard:** small Vite/React inspector as pure projection of the event stream (stretch goal, L7).

## Branching strategy

Like the course: `lesson-1` → … → `lesson-7` → `main`. Each branch adds exactly
one harness module; the next branch includes the previous solution.

## Non-goals (for now)

- No real external adapters (publishing, payments) — everything fake-but-realistic.
- No vertical product — the company scenario stays deliberately boring.
- Dashboard is a projection, never taught/built in depth.
