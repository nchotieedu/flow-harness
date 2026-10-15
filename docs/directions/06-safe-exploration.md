# Direction — Safe exploration

**Question:** How far can agents explore (write code, mutate state, talk to
the world) before the boundary must harden from `node:vm` to a real isolate?

Current state: `runInSandbox` freezes the global, times out sync code, and
mediates all I/O through an injected API. Honestly documented limits: no async
kill, not a security boundary.

Open problems: graded sandboxing (trust levels per agent/phase), read-only vs
read-write APIs, egress control. First experiment: same Code Mode task under
three boundary strengths; compare capability and failure modes.
