# flow-harness

A **research instrument for pushing the boundaries of what agents can do**:
a minimal, production-grade agent runtime (the *harness*) plus the *Flow
scenario* — a small self-directing AI company — as its first stress test.

> **Agent systems are workflow systems.** The LLM decides the next semantic
> step; the harness owns execution: durability, memory, policy, supervision,
> human control.

## What makes it a lab, not an app

- **The harness is domain-free.** Everything scenario-specific (agents, tools,
  policy) plugs in through factories — see [ARCHITECTURE.md](ARCHITECTURE.md).
- **The event log is the system.** Every model call, tool call, handoff, block
  and approval is a durable row in Postgres. Research reads that one stream.
- **Durable by default.** Kill -9 mid-run and it resumes from its last step;
  approvals can suspend work for days (DBOS workflows).
- **Experiments over features.** See [docs/directions/](docs/directions/) for
  the research frontiers and [docs/research-log.md](docs/research-log.md) for
  results so far.

## Quickstart

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in a provider key (GLM by default)
createdb flow_harness            # local Postgres

npm run submit                   # one work item through the company loop
npm run inspect                  # read the durable event log
npm run test:sandbox             # sandbox guardrail demo
npm run typecheck
```

## Switching models

Pure config in `.dev.vars` — no code changes:

```bash
MODEL_PROVIDER=glm       # glm | openai | custom (any OpenAI-compatible endpoint)
MODEL_ID=glm-5.3-flash
GLM_API_KEY=...          # z.ai (international) or bigmodel.cn (mainland)
```

## Repository layout

```
src/harness/         the runtime — generic, reusable, domain-free
src/scenarios/flow/  the Flow company: agents, tools, workflows binding
scripts/             submit · inspect · sandbox demo
docs/                research log + research directions
experiments/         (reserved) numbered experiment assets
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a **Research idea** issue.
Agent mistakes are findings, not bugs. Apache-2.0 — see [LICENSE](LICENSE).
