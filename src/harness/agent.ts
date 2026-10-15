import type { ToolSet } from "ai";

// An agent is just a name, a system prompt, and the subset of tools it's allowed
// to use. The runtime runs ANY agent through the same durable loop — so adding
// a specialist is data, not new machinery.

export type Agent = {
  name: string;
  systemPrompt: string;
  tools: ToolSet;
};
