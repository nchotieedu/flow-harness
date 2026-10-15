import { tool } from "ai";
import { z } from "zod";
import { runInSandbox, type SandboxApi } from "@harness/sandbox";

// ── Canned data the read tools serve ────────────────────────────────────────
//
// P1 keeps the company domain deliberately tiny: two open work items, a few
// company docs. P2 replaces this with real SQLite tables.

export type WorkItem = {
  id: string;
  title: string;
  objectiveId: string;
  amountCents: number;
};

export const WORK_ITEMS: WorkItem[] = [
  {
    id: "wi_101",
    title: "Enterprise customer requests SSO integration",
    objectiveId: "obj_growth",
    amountCents: 40000,
  },
  {
    id: "wi_102",
    title: "Onboarding docs are outdated after the v2 migration",
    objectiveId: "obj_ops",
    amountCents: 0,
  },
];

const COMPANY_DOCS: Record<string, string> = {
  sso: "SSO is the top requested enterprise feature (ROADMAP-7). Estimated effort: 3 engineer-weeks, 400 EUR in SaaS licensing.",
  docs: "Onboarding docs must always match the current API version. The v2 migration changed every endpoint path from /v1 to /v2.",
  pricing: "Team plans are 20 EUR/seat/month, volume discount from 25 seats. Enterprise deals are custom-quoted.",
  budget: "Each objective has a budget. Spending over the objective's limit requires explicit approval and is logged as an incident if attempted without it.",
};

export function searchDocs(query: string): string[] {
  const q = query.toLowerCase();
  const hits = Object.entries(COMPANY_DOCS)
    .filter(([key]) => q.includes(key))
    .map(([, doc]) => doc);
  return hits.length ? hits : ["No exact match — use your judgment."];
}

// ── The read/compute API exposed INTO the sandbox (Code Mode) ────────────────
//
// Read-only: a re-run (after a crash) is harmless, so the whole runCode step
// stays a single durable unit without risking duplicate side effects.
const sandboxApi: SandboxApi = {
  getWorkItems: async () => WORK_ITEMS,
  searchDocs: async (query: string) => searchDocs(query),
};

// ── The tool SCHEMAS the model sees ─────────────────────────────────────────

export const tools = {
  // Code Mode: the agent writes ONE program that fetches and analyzes, instead
  // of chaining a dozen tool calls through the model.
  runCode: tool({
    description: [
      "Run a JavaScript program (an async function body) to fetch and analyze data.",
      "Available inside the program:",
      "  • await tools.getWorkItems() → [{ id, title, objectiveId, amountCents }]",
      "  • await tools.searchDocs(query) → string[]",
      "  • console.log(...) for debugging",
      "Use `return` to return your result (any JSON value).",
    ].join("\n"),
    inputSchema: z.object({ code: z.string() }),
  }),

  classifyItem: tool({
    description: "Classify a work item into a department category.",
    inputSchema: z.object({
      itemId: z.string(),
      category: z.enum(["product", "technical", "growth", "ops", "other"]),
    }),
  }),
  draftAction: tool({
    description: "Write a draft action for a work item. Does not send anything.",
    inputSchema: z.object({ itemId: z.string(), message: z.string() }),
  }),
  sendMessage: tool({
    description: "Send the drafted action to the company channel. This really posts it.",
    inputSchema: z.object({ itemId: z.string(), draftId: z.string() }),
  }),

  // Privileged: only the tech specialist gets this. Moves real money.
  spendBudget: tool({
    description: "Spend from an objective's budget. IRREVERSIBLE — this moves real money.",
    inputSchema: z.object({
      itemId: z.string(),
      amountCents: z.number(),
    }),
  }),

  // Hand the work item to a specialist agent. The harness intercepts this —
  // it switches the running agent rather than executing a tool.
  handoff: tool({
    description:
      "Hand off the work item to a specialist agent when the task needs a capability you don't have (e.g. spending budget → tech).",
    inputSchema: z.object({ to: z.enum(["tech"]), reason: z.string() }),
  }),
};

// ── The harness-owned executor ──────────────────────────────────────────────
//
// `runCode` is mediated: it never runs in the host process, only in the sandbox.
// The side-effecting tools (sendMessage, spendBudget) run here as normal
// durable steps.
// Tools a human must approve before they run (HITL, wired into the workflow).
export const DANGEROUS_TOOLS = new Set(["spendBudget"]);

export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "runCode":
      return runInSandbox(String(args.code ?? ""), sandboxApi);
    case "getWorkItems":
      return { workItems: WORK_ITEMS };
    case "searchDocs":
      return { docs: searchDocs(String(args.query ?? "")) };
    case "classifyItem":
      return { ok: true, itemId: args.itemId, category: args.category };
    case "draftAction":
      return { ok: true, draftId: `draft-${args.itemId}` };
    case "sendMessage":
      return { sent: true, itemId: args.itemId, draftId: args.draftId };
    case "spendBudget":
      return { spent: true, itemId: args.itemId, amountCents: args.amountCents };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
