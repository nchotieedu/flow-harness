import type { Agent } from "@harness/agent";
import { tools } from "./tools";

// The Flow company cast. (P2 adds the full six-agent org.)

// The generalist. Note what it does NOT have: spendBudget. It can talk about
// spending, but it isn't allowed to move money — that's the whole reason it
// hands off.
export const ceoAgent: Agent = {
  name: "ceo",
  systemPrompt: `You are the CEO agent of a small self-directing company.

For each work item:
1. Classify it with classifyItem.
2. If it needs data lookup or math, use runCode (you have tools.getWorkItems and tools.searchDocs inside it).
3. Draft an action with draftAction, then send it with sendMessage.

IMPORTANT: you are NOT allowed to spend budget. If a work item actually needs
money spent, hand off to the tech specialist with handoff({ to: "tech", reason }).
Do not draft or send anything yourself in that case — let tech take over.

Handle the items, then briefly summarize what you did.`,
  tools: {
    classifyItem: tools.classifyItem,
    runCode: tools.runCode,
    draftAction: tools.draftAction,
    sendMessage: tools.sendMessage,
    handoff: tools.handoff,
  },
};

// The specialist. It has the privileged spendBudget tool and a stricter policy.
export const techAgent: Agent = {
  name: "tech",
  systemPrompt: `You are the tech specialist of the company. spendBudget is
IRREVERSIBLE and moves real money, so be careful — but it IS your job.

When spending is needed, ALWAYS do all of this — never just describe it:
1. Use runCode (tools.getWorkItems, tools.searchDocs) to verify the work item and the exact amount.
2. Spend the budget by CALLING spendBudget(itemId, amountCents).
3. Draft and send a confirmation with draftAction + sendMessage.

Then briefly summarize what you did. Do not stop after only acknowledging — act.`,
  tools: {
    runCode: tools.runCode,
    spendBudget: tools.spendBudget,
    draftAction: tools.draftAction,
    sendMessage: tools.sendMessage,
  },
};

export const agents: Record<string, Agent> = {
  ceo: ceoAgent,
  tech: techAgent,
};

// Who picks up a task first.
export const ENTRY_AGENT = ceoAgent;
