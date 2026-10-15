# Research log

One dated entry per experiment. Hypothesis → setup → result → surprise.

---

## 001 — 2026-10-15 — Port the complete harness, point it at Flow

- **Hypothesis:** The course's final harness (durable loop, handoffs, HITL,
  supervisor, sandbox) is a sufficient substrate for a multi-agent company
  scenario without modifying the loop.
- **Setup:** Ported the complete harness, refactored it into factories
  (`createAgentWorkflow`, `createSupervisorWorkflow`), re-skinned the domain to
  Flow (ceo → tech handoff, `spendBudget` as the privileged HITL tool), switched
  the model layer to a provider switch (GLM/openai/any OpenAI-compatible).
- **Result:** Skeleton runs end-to-end against local Postgres (DBOS v4);
  typecheck clean; sandbox guardrails verified (timeout kill, no host access,
  structured errors). End-to-end model run pending a GLM key.
- **Surprise:** None yet — the loop's generality survived the domain swap
  untouched, which is the point.

## 002 — 2026-10-15 — The pivot: from company to sustained autonomy

- **Research question (new mission):** Can six agents achieve a long-term
  goal, maintain what they built, and recover from failures WITHOUT repeated
  human direction? Understand an application, implement changing
  requirements, migrate its data, deploy it, and keep it working across a
  configurable horizon (20/30/90 days), within a fixed compute budget. The
  headline metric: **human interventions per horizon → 0**.
- **The six functional roles:** mission coordinator (change plans without
  losing the objective), investigator (incomplete/outdated/contradictory
  information), architect (consequences several stages ahead), builder (fit
  changes made by others), operator (preserve service through change),
  independent verifier (actual success vs convincing reports).
- **The target is the lab itself (meta):** the six agents maintain the
  flow-harness repository in an isolated git workspace clone. The Flow
  company scenario is archived to `archive/flow-company`.
- **New harness pieces (all domain-free):** SimClock (configurable horizon +
  pacing, durable day sleeps), Workspace (isolated clone, real-git
  checkpoints/restores), BudgetMeter (per-run role-run accounting, hard
  stop), createVerifierWorkflow (mechanical checks + independent judge,
  verdicts as events).
- **Smoke-run findings (before the first full mission):**
  1. *Recovery in the wild:* a kill -9 mid-mission was resumed by the next
     DBOS launch, completing its horizon — durability is not a demo, it
     happened.
  2. *The verifier has teeth:* day 1's mechanical checks were GREEN
     (typecheck + sandbox pass) yet the verifier FAILED the claim — the
     builder's report was empty and no evidence showed the requirement
     existed in the files. Green checks ≠ implemented requirement.
  3. *Narration without action:* roles produced fluent final reports with
     ZERO tool calls until prompts explicitly forced tool use ("a report
     without tool calls is a failed report"). The metric changed: tool calls
     per role run.
  4. *Model reliability is a first-class research variable:* glm-5.3-flash
     once burned ~13k reasoning tokens and returned no object, killing the
     plan step and with it the mission. Fixed with graceful degradation
     (deterministic fallback plan; missing judge verdict = challenge, never
     pass). Long-horizon autonomy needs failure budgets, not just compute
     budgets.
  5. *Instrumentation gap closed:* role-internal tool calls now mirror onto
     the event log; the log must see everything or the research is blind.
- **Running:** first full 30-day mission (`mission-sustain-30d`, 140 role-run
  budget). Results in entry 003.
