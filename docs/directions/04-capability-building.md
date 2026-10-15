# Direction — Capability building

**Question:** When an agent needs a skill it doesn't have, can it build,
propose, and get a tool provisioned — safely?

Current state: the tool surface is fixed at registration; the sandbox mediates
code the model writes (Code Mode) but nothing persists.

Open problems: tool proposals as first-class events, human provisioning
(HITL for capability grants, not just actions), skill reuse across agents.
First experiment: agent writes a sandbox-verified helper, files a proposal,
human provisions it into a role's tool surface.
