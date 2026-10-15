# Direction — Coordination without a manager

**Question:** How much structure must the harness impose before six agents
coordinating through messages and shared memory produce coherent work instead
of noise?

Current state: lateral handoffs (single conversation) and a supervisor
(plan → fan-out → fan-in) exist. No shared workspace, no message priority
interrupts, no negotiation.

Open problems: message semantics (who reads what, when), double-handling
(two agents, same work item), escalation loops. First experiment: work-item
routing by message only, with the supervisor as fallback.
