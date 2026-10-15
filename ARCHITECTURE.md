# Architecture

flow-harness is a **research instrument**: a minimal but production-grade agent
runtime (the *harness*) plus a scenario that stresses it (the *Flow company*).
The library is the boundary: `src/harness` knows nothing about Flow, and every
new capability lands as a swappable module, not a fork of the loop.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  experiments/ + docs/      research: hypothesis → result    │
├─────────────────────────────────────────────────────────────┤
│  src/scenarios/<name>      a world for agents to live in    │
│    flow/   agents · tools · investigators · workflows       │
│            (binds harness factories to the Flow company)    │
├─────────────────────────────────────────────────────────────┤
│  src/harness               THE RESEARCH ARTIFACT (generic)  │
│    runtime      durable agent loop: model ⇄ tools ⇄ handoff │
│    supervisor   plan → parallel fan-out → fan-in → synthesis│
│    memory       context hydration + token-budget compaction │
│    sandbox      mediated code execution (node:vm boundary)  │
│    model        provider switch (glm/openai/any-compatible) │
│    bus + db     durable append-only event log (Postgres)    │
│    events       the wire contract: the log IS the system    │
├─────────────────────────────────────────────────────────────┤
│  DBOS (durable workflows) · Postgres · Vercel AI SDK        │
└─────────────────────────────────────────────────────────────┘
```

Everything the system does becomes an event on the durable log; the UI, the
research log, and every experiment read from that one stream.

## Extension points

The harness exposes **factories**, so scenarios register their own DBOS
workflows without touching runtime code:

| Factory | You provide | You get |
|---|---|---|
| `createAgentWorkflow()` | `agents`, `entryAgent`, `runTool`, `needsApproval?`, `maxSteps?` | durable loop with memory compaction, handoff interception, HITL suspend/resume |
| `createSupervisorWorkflow()` | `departments`, `runInvestigator`, optional plan/synthesis prompts | plan → parallel sub-agents → fan-in → synthesis |

Planned seams (add the factory when the first experiment needs it — not before):

| Seam | Replaces | Research question |
|---|---|---|
| `stateStore` | DBOS defaults | can we checkpoint richer than step-level? |
| `policyEngine` | `needsApproval` set | can guardrails learn, not just block? |
| `memoryStore` | in-prompt turns | what survives a crash worth remembering? |
| `transport` | Express+ws CLI | how do humans steer long-horizon work? |
| `scenario` registry | hardcoded import | how portable is a "company"? |

## The invariants

1. **Agent systems are workflow systems.** The LLM decides the next semantic
   step; the harness owns execution.
2. **The event log is the system.** UI, debugging, and research all read the
   same durable stream. No side channels.
3. **Durable by default.** Every side effect is a DBOS step: kill -9 resumes
   exactly where it stopped; approvals can take days.
4. **The harness is domain-free.** If a change to `src/harness` mentions
   "CEO", "work item", or Flow, the boundary leaked.
5. **Boring code.** This repo exists to study failure modes of *agents*; the
   failure modes of the *code* should be none.

## Running

See [README](README.md) for setup. Entry points:

- `npm run submit` — one task through the scenario (CLI)
- `npm run dev` — server + ws for an inspector
- `npm run inspect` — read the durable event log
- `src/scenarios/flow/workflows.ts` — where Flow binds to the harness

## Open-source expansion path

1. **Now:** single package, scenario-as-example, Apache-2.0, research log.
2. **Next:** extract scenarios into examples; publish `@flow-harness/harness`
   once the factory surface is stable across 2+ scenarios.
3. **Later:** split packages (`harness-core`, `harness-dbos`, adapters for
   memory/policy backends) only when the seams above have real consumers.

Contribution flow, templates, and the research idea pipeline live in
[CONTRIBUTING.md](CONTRIBUTING.md) and `.github/`.
