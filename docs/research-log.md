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
