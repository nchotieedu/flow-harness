import { DBOS } from "@dbos-inc/dbos-sdk";
import { createAgentWorkflow } from "@harness/runtime";
import { createSupervisorWorkflow } from "@harness/supervisor";
import { agents, ENTRY_AGENT } from "./agents";
import { runTool, DANGEROUS_TOOLS } from "./tools";
import { runInvestigator, DEPARTMENTS } from "./investigators";

// The DBOS workflow registry for the Flow scenario. The harness provides the
// runtime patterns; this file binds them to Flow's cast, tools and policy.

export const runAgentWorkflow = DBOS.registerWorkflow(
  createAgentWorkflow({
    agents,
    entryAgent: ENTRY_AGENT,
    runTool,
    needsApproval: DANGEROUS_TOOLS,
  }),
  { name: "flowAgentWorkflow" },
);

export const runSupervisorWorkflow = DBOS.registerWorkflow(
  createSupervisorWorkflow({
    departments: [...DEPARTMENTS],
    runInvestigator,
  }),
  { name: "flowSupervisorWorkflow" },
);
