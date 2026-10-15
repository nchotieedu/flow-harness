// MUST be first: loads .dev.vars before any module that reads env at load time.
import "../src/env";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { ensureSchema } from "@harness/db";
import { sustainMissionWorkflow } from "../src/scenarios/sustain/workflows";
import { loadMission, DEFAULT_MISSION } from "../src/scenarios/sustain/mission";
import { SIM_DAY_MS } from "../src/harness/simclock";

// CLI entry point: run a sustain mission without the web UI.
//   npm run submit                        → runs the default 30-day mission
//   npm run submit -- mission-sustain-30d → runs a named mission
//   SIM_DAYS=5 SIM_DAY_MS=5000 npm run submit mission-sustain-30d → smoke run
//
// NOTE: missions run against the LIVE event log — `npm run inspect` afterwards
// shows the full durable timeline.

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const missionName = args[0] ?? DEFAULT_MISSION;

// Validate the mission BEFORE launching (clear error beats a dead workflow).
const mission = loadMission(missionName);

async function main() {
  await ensureSchema();

  DBOS.setConfig({ name: "flow-harness-submit", systemDatabaseUrl: process.env.DATABASE_URL });
  await DBOS.launch();

  console.log(`mission: ${mission.name} (${mission.horizonDays} sim days @ ${SIM_DAY_MS}ms/day, budget ${mission.budgetUnits} units)`);
  console.log(`goal: ${mission.goal}\n`);

  const handle = await DBOS.startWorkflow(sustainMissionWorkflow)(missionName);
  console.log(`workflow ${handle.workflowID} started\n`);

  const result = await handle.getResult();
  console.log("── result ──");
  console.log(result || "(no output — check the event log)");

  await DBOS.shutdown();
  process.exit(0);
}

main().catch((error) => {
  console.error("mission failed:", error);
  process.exit(1);
});
