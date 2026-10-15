# flow-harness

A **research instrument for pushing the boundaries of what agents can do**:
a minimal, production-grade agent runtime (the *harness*) plus the *sustain
scenario* — six functional agents that must understand an application,
implement changing requirements, and keep it working across a configurable
horizon (20/30/90 simulated days) within a fixed compute budget, WITHOUT
repeated human direction.

> **Agent systems are workflow systems.** The LLM decides the next semantic
> step; the harness owns execution: durability, memory, policy, supervision,
> human control.

## What makes it a lab, not an app

- **The harness is domain-free.** Everything scenario-specific (roles, tools,
  missions) plugs in through factories — see [ARCHITECTURE.md](ARCHITECTURE.md).
- **The event log is the system.** Every model call, tool call, handoff, block
  and approval is a durable row in Postgres. Research reads that one stream.
- **Durable by default.** Kill -9 mid-run and it resumes from its last step;
  approvals can suspend work for days (DBOS workflows).
- **Experiments over features.** See [docs/directions/](docs/directions/) for
  the research frontiers and [docs/research-log.md](docs/research-log.md) for
  results so far.

## The six roles

| Agent | Responsibility | What makes it hard |
|---|---|---|
| Mission coordinator | maintain the goal, prioritize, assign, resolve conflicts | change plans without losing the objective |
| Investigator | explore code, docs, data, logs; test assumptions | information is incomplete, outdated, contradictory |
| Architect | design changes, interfaces, migration plans | consequences several stages ahead |
| Builder | implement, script, integrate | work must fit other agents' changes |
| Operator | deploy, monitor, checkpoint, restore | preserve service while the system changes |
| Independent verifier | test outcomes, reproduce failures, challenge claims | actual success vs convincing reports |

The target under maintenance is **this repository itself**, in an isolated
git workspace clone — a Builder mistake can never kill the lab.

## Quickstart

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in a provider key (GLM by default)
createdb flow_harness            # local Postgres

npm run submit                                # full mission (30 sim days)
npm run submit -- my-mission                  # a named mission from src/scenarios/sustain/missions/
SIM_DAYS=5 SIM_DAY_MS=4000 npm run submit ... # 5-day smoke of any mission
npm run inspect                               # read the durable event log
npm run typecheck
```

Key metrics live in the event log: `verification.passed/failed/challenged`,
`budget.charged`, `checkpoint.taken`, `incident.raised` — and the headline:
human interventions per mission.

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
src/scenarios/sustain/  the six-role mission: roles, tools, seeded mission files
scripts/             submit · inspect · sandbox demo
docs/                research log + research directions
experiments/         (reserved) numbered experiment assets
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a **Research idea** issue.
Agent mistakes are findings, not bugs. Apache-2.0 — see [LICENSE](LICENSE).
