import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Missions: the change stream ─────────────────────────────────────────────
//
// A mission is the RESEARCH INPUT: a goal, a horizon, and a seeded stream of
// requirements and incidents spread over simulated days. Swapping the JSON
// file swaps the problem — same six agents, same harness, different world.
// That is what makes runs comparable and the problem space extensible.

const MISSIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "missions");

export const DEFAULT_MISSION = "mission-sustain-30d";

export type MissionEntry = {
  day: number;
  id: string;
  kind: "requirement" | "incident";
  title: string;
  detail: string;
};

export type Mission = {
  name: string;
  horizonDays: number;
  budgetUnits: number;
  goal: string;
  entries: MissionEntry[];
};

export function loadMission(name: string): Mission {
  const file = path.join(MISSIONS_DIR, `${name}.json`);
  const mission = JSON.parse(fs.readFileSync(file, "utf8")) as Mission;
  const overHorizon = mission.entries.filter((e) => e.day > mission.horizonDays);
  if (overHorizon.length > 0) {
    throw new Error(
      `mission ${name}: entries beyond horizon (${mission.horizonDays}): ${overHorizon.map((e) => e.id).join(", ")}`,
    );
  }
  return mission;
}

export function entriesDue(mission: Mission, day: number): MissionEntry[] {
  return mission.entries.filter((e) => e.day === day);
}
