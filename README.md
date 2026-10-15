# flow-harness

Rebuilding the Flow agentic company on top of a self-built agent harness —
ported from the **complete** Harness Engineering course harness and adapted to
Flow's domain, phase by phase (see [PLAN.md](PLAN.md)).

## Stack

Node + TypeScript (tsx) · Vercel AI SDK (server-side) · DBOS durable workflows ·
Postgres + Drizzle (durable event log) · Express + one WebSocket.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in GLM_API_KEY (or another provider's key)
```

Requires a local Postgres with a `flow_harness` database (`createdb flow_harness`).

## Switching models

Pure config in `.dev.vars` — no code changes:

```bash
MODEL_PROVIDER=glm       # glm | openai | custom (any OpenAI-compatible endpoint)
MODEL_ID=glm-5.3-flash
GLM_API_KEY=...          # from z.ai (international) or bigmodel.cn (mainland)
# GLM_BASE_URL=https://api.z.ai/api/paas/v4
```

## Run

```bash
npm run submit                    # one work item through the CEO agent loop
npm run submit -- "your task"     # your own task
MODE=supervised npm run submit    # supervisor (fan-out to departments)
npm run inspect                   # summarize the durable event log
npm run inspect -- truncate       # wipe the event log
npm run dev                       # server on :8787 (ws /ws) for a future inspector
npm run test:sandbox              # sandbox guardrail demo
npm run typecheck
```

The sample task (`wi_102`, doc update) completes without human approval.
Work item `wi_101` (needs budget) triggers the approval flow: the workflow
suspends, and you resolve it with

```bash
curl -X POST localhost:8787/api/approve/<workflowId> -H 'Content-Type: application/json' -d '{"approved": true}'
```

while `npm run dev` is running.
