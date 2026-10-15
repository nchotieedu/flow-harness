import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { model } from "./model";
import { WORK_ITEMS, searchDocs } from "./tools";

// Sub-agents are read-only INVESTIGATORS. Their tools have `execute`, so the AI
// SDK runs the tool loop inline and each sub-agent is one bounded interaction we
// can run as a single durable step. Read-only → a re-run on recovery is safe.
const getWorkItems = tool({
  description: "List the company's open work items.",
  inputSchema: z.object({}),
  execute: async () => WORK_ITEMS,
});

const searchCompanyDocs = tool({
  description: "Search the company docs (product, roadmap, pricing, budget).",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => searchDocs(query),
});

type Investigator = { systemPrompt: string; tools: ToolSet };

const INVESTIGATORS: Record<string, Investigator> = {
  tech: {
    systemPrompt:
      "You are a tech investigator. Use getWorkItems and searchCompanyDocs to find implementation effort, dependencies and costs. Report ids, effort and cost estimates — concisely.",
    tools: { getWorkItems, searchCompanyDocs },
  },
  growth: {
    systemPrompt:
      "You are a growth investigator. Use searchCompanyDocs for pricing and positioning guidance, then state the relevant numbers and next step — concisely.",
    tools: { searchCompanyDocs },
  },
  ops: {
    systemPrompt:
      "You are an ops investigator. Use searchCompanyDocs to find process gaps, known issues and workarounds. Report the issue and the next step — concisely.",
    tools: { searchCompanyDocs },
  },
};

// Run one investigator over its objective in its OWN context. Returns findings.
export async function runInvestigator(agent: string, objective: string): Promise<string> {
  // A chaos hook so the failure-handling demo is reproducible:
  // CHAOS_FAIL=tech npm run dev  → the tech investigator always fails.
  if (process.env.CHAOS_FAIL === agent) {
    throw new Error(`investigator '${agent}' crashed (CHAOS_FAIL)`);
  }

  const investigator = INVESTIGATORS[agent];
  if (!investigator) throw new Error(`unknown investigator: ${agent}`);

  const { text } = await generateText({
    model,
    system: investigator.systemPrompt,
    prompt: objective,
    tools: investigator.tools,
    stopWhen: stepCountIs(5),
  });
  return text;
}
