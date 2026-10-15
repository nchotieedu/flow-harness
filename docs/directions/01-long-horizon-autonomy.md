# Direction — Long-horizon autonomy

**Question:** Can an agent hold a goal for days, not minutes — surviving
crashes, context loss, and its own drift?

Current state: DBOS gives step-level durability (crash → resume), and memory
compaction bounds the context window. What's missing:

- goal persistence beyond a single workflow (a "company" outlives any run)
- drift detection: is the agent still doing what it decided on day 1?
- horizon metrics: how far can one uninterrupted objective chain stretch?

First experiment sketch: give the CEO agent a week-long objective with
checkpoints; measure divergence between stated plan and event-log behavior.
