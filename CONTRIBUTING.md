# Contributing

flow-harness is a research project: **experiments over features**. The best PR
either runs an experiment, hardens the harness, or sharpens a research
question.

## The ground rules

1. **`src/harness` stays domain-free.** No company names, no scenario vocab.
   If your feature needs domain words, it belongs in a scenario.
2. **Extend via factories.** New capability = new factory option or new module
   behind an interface — not an edit to the loop's branch logic. Add a seam
   (see [ARCHITECTURE.md](ARCHITECTURE.md)) only when a real experiment needs it.
3. **Every event survives a crash.** New side effects must run as DBOS steps.
   If `npm run inspect` can't see it, it didn't happen.
4. **Boring code.** Explicit over clever. The failure modes under study should
   come from the agents, never from the codebase.

## Running an experiment

1. Open a **Research idea** issue (template provided) — state the hypothesis
   and what would falsify it.
2. Build on `main`; keep the scenario data fake-but-realistic.
3. Land a note in `docs/research-log.md` (dated entry: hypothesis, setup,
   result, what surprised you) and, when warranted, a file under
   `docs/directions/`.
4. PRs that claim a result must include the event-log evidence
   (`npm run inspect` output or a timeline dump).

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in a provider key
createdb flow_harness            # local Postgres
npm run typecheck && npm run test:sandbox && npm run submit
```

Commits: plain conventional one-liners (`experiment: …`, `harness: …`,
`scenario: …`, `docs: …`). No co-author lines.
