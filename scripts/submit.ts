import { config } from "dotenv";

config({ path: ".dev.vars" });

// MUST be first: loads .dev.vars before any module that reads env at load time.
import "./env";

import { DBOS } from "@dbos-inc/dbos-sdk";
import postgres from "postgres";
import { ensureSchema } from "../harness/db";
import { runAgentWorkflow } from "../harness/runtime";
import { runSupervisorWorkflow } from "../harness/supervisor";
import { SAMPLE_TASK } from "../harness/system-prompt";

// CLI entry point: submit a work item without the web UI.
//   npm run submit                      → runs SAMPLE_TASK through the CEO loop
//   npm run submit -- "objective text"  → runs your own task
//   MODE=supervised npm run submit ...  → runs the supervisor instead
// Polls the workflow handle until it finishes, then prints the result.
// Use `npm run inspect` afterwards to see the durable event log.

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const task = args.join(" ") || SAMPLE_TASK;
const supervised = process.env.MODE === "supervised";

async function main() {
  await ensureSchema();

  DBOS.setConfig({ name: "flow-harness-submit", systemDatabaseUrl: process.env.DATABASE_URL });
  await DBOS.launch();

  const workflow = supervised ? runSupervisorWorkflow : runAgentWorkflow;
  const handle = await DBOS.startWorkflow(workflow)(task);
  console.log(`workflow ${handle.workflowID} started (${supervised ? "supervised" : "default"} mode)`);
  console.log(`task: ${task}\n`);

  const result = await handle.getResult();
  console.log("── result ──");
  console.log(result || "(no output — check the event log)");

  await DBOS.shutdown();
  process.exit(0);
}

main().catch((error) => {
  console.error("submit failed:", error);
  process.exit(1);
});
