import { DBOS } from "@dbos-inc/dbos-sdk";
import { generateObject, generateText, stepCountIs } from "ai";
import { z } from "zod";
import type { ToolSet } from "ai";
import { randomUUID } from "node:crypto";
import { EventType } from "@harness/events";
import { emit } from "@harness/bus";
import { model } from "@harness/model";
import { createBudget, chargeStep } from "@harness/budget";
import {
  provisionWorkspace,
  attachWorkspace,
  REPO_ROOT,
  type Workspace,
} from "@harness/workspace";
import { createVerifierWorkflow, type MechanicalCheck } from "@harness/verifier";
import { SIM_DAYS, SIM_DAY_MS } from "@harness/simclock";
import { loadMission, entriesDue, type Mission, type MissionEntry } from "./mission";
import { roleTools } from "./tools";
import {
  COORDINATOR_PROMPT,
  INVESTIGATOR_PROMPT,
  ARCHITECT_PROMPT,
  BUILDER_PROMPT,
  OPERATOR_PROMPT,
  VERIFIER_PROMPT,
} from "./roles";

// ── The sustain mission workflow ────────────────────────────────────────────
//
// One durable workflow advances simulated time day by day:
//
//   day starts → change stream fires → COORDINATOR plans (assigns roles) →
//   roles run in the isolated workspace (investigate / design / build /
//   operate) → the INDEPENDENT VERIFIER judges the day's completion claim →
//   checkpoint only on a verified pass → mission state persists → sleep.
//
// Durability: every side effect is a DBOS step; pacing is DBOS.sleep. Kill -9
// at day 17 and the mission resumes at day 17 with every completed day intact.
//
// Budget: `budgetUnits` in the mission file bounds total role-runs + daily
// verification. Exhausted budget ends the mission — the fixed-compute-budget
// constraint is real.

// One active mission at a time (documented research limitation for v1): tool
// closures resolve the workspace lazily through this module-level ref.
let ACTIVE_WS: Workspace | null = null;
function getWs(): Workspace {
  if (!ACTIVE_WS) throw new Error("no active workspace — tools only work inside a mission run");
  return ACTIVE_WS;
}

export const DISPATCH_ROLES = ["investigator", "architect", "builder", "operator"] as const;
type DispatchRole = (typeof DISPATCH_ROLES)[number];

const ROLE_PROMPTS: Record<string, string> = {
  coordinator: COORDINATOR_PROMPT,
  investigator: INVESTIGATOR_PROMPT,
  architect: ARCHITECT_PROMPT,
  builder: BUILDER_PROMPT,
  operator: OPERATOR_PROMPT,
  verifier: VERIFIER_PROMPT,
};

// A role run: one bounded tool-loop in its OWN context, run as a durable step
// (cached on recovery — same pattern as the archived investigators).
// Tool calls inside the loop are SDK-internal, so we WRAP each tool's execute
// to mirror them onto the event log — the log must see everything.
function instrumentedTools(role: DispatchRole): ToolSet {
  const base = roleTools(role, getWs);
  const wrapped: ToolSet = {};
  for (const [name, t] of Object.entries(base)) {
    const toolObj = t as { execute?: (input: any, options: any) => Promise<unknown> };
    const exec = toolObj.execute;
    if (!exec) {
      wrapped[name] = t;
      continue;
    }
    wrapped[name] = {
      ...t,
      execute: async (input, options) => {
        const wf = DBOS.workflowID ?? "unknown";
        const toolCallId = randomUUID();
        await emit({ type: EventType.ToolRequested, workflowId: wf, toolCallId, name, args: input });
        try {
          const result = await exec(input, options);
          await emit({ type: EventType.ToolCompleted, workflowId: wf, toolCallId, result });
          return result;
        } catch (err) {
          await emit({
            type: EventType.ToolFailed,
            workflowId: wf,
            toolCallId,
            error: String(err).slice(0, 300),
          });
          throw err;
        }
      },
    } as (typeof base)[string];
  }
  return wrapped;
}

async function runRole(role: DispatchRole, objective: string): Promise<string> {
  const { text } = await generateText({
    model,
    system: ROLE_PROMPTS[role],
    prompt: objective,
    tools: instrumentedTools(role),
    stopWhen: stepCountIs(12),
  });
  return text;
}

// The coordinator decomposes a DAY into 1–4 role assignments.
const PlanSchema = z.object({
  steps: z
    .array(
      z.object({
        role: z.enum(DISPATCH_ROLES),
        objective: z.string().describe("exactly what this role must accomplish today"),
      }),
    )
    .min(1)
    .max(4),
});

async function planDay(
  mission: Mission,
  day: number,
  due: MissionEntry[],
  missionState: string,
  recentCommits: string,
): Promise<z.infer<typeof PlanSchema>> {
  const prompt = [
    `MISSION GOAL (never lose this): ${mission.goal}`,
    ``,
    `Simulated day ${day}/${mission.horizonDays}.`,
    due.length
      ? `Items due today:\n${due.map((e) => `- [${e.kind}] ${e.id}: ${e.title} — ${e.detail}`).join("\n")}`
      : `Nothing new is due today. Decide whether maintenance, investigation, or a rest day (still assign at least one role to check health).`,
    ``,
    `Current mission state:\n${missionState}`,
    `Recent workspace commits:\n${recentCommits}`,
    ``,
    `Assign 1–4 steps. Builders implement; investigators verify facts first when an item is unclear; architects design anything touching interfaces or data; operators keep the system healthy. State each objective so the role can act WITHOUT further context.`,
  ].join("\n");

  try {
    const { object } = await generateObject({ model, schema: PlanSchema, system: COORDINATOR_PROMPT, prompt });
    return object;
  } catch (err) {
    // GRACEFUL DEGRADATION — a long mission must survive a bad model response.
    // Deterministic fallback: one builder step per due item (research signal:
    // this fallback fires = model reliability event, visible in the log).
    await emit({
      type: EventType.Log,
      workflowId: DBOS.workflowID ?? "unknown",
      level: "warn",
      message: `plan fallback engaged (model returned no usable object): ${String(err).slice(0, 160)}`,
    });
    return {
      steps: (due.length ? due : []).slice(0, 4).map((e) => ({
        role: "builder" as const,
        objective: `${e.id}: ${e.title} — ${e.detail}`,
      })),
    };
  }
}

// The verifier's mechanical checks: REAL commands against the REAL workspace.
// No model involved — a red typecheck is a red typecheck.
const runChecks: MechanicalCheck = async () => {
  const ws = getWs();
  const t = await ws.runCommand("npm run typecheck", 180_000);
  const s = await ws.runCommand("npm run test:sandbox", 180_000);
  const passed = t.ok && s.ok;
  const tail = (r: { ok: boolean; stdout: string; stderr: string }) =>
    ((r.stderr || "") + (r.stdout || "")).trim().slice(-700);
  const evidence = [
    `typecheck: ${t.ok ? "GREEN" : "RED"}\n${tail(t)}`,
    `test:sandbox: ${s.ok ? "GREEN" : "RED"}\n${tail(s)}`,
  ].join("\n---\n");
  return { passed, evidence };
};

const verifyDay = createVerifierWorkflow({ runChecks });

export const sustainMissionWorkflow = DBOS.registerWorkflow(
  async (missionName: string): Promise<string> => {
    const wf = DBOS.workflowID ?? "unknown";
    const mission = await DBOS.runStep(async () => loadMission(missionName), { name: "load-mission" });
    // Horizon: the mission file is the source of truth; SIM_DAYS caps it for
    // smoke runs (SIM_DAYS=5 npm run submit → first 5 days of any mission).
    const horizon = Math.min(mission.horizonDays, Number(process.env.SIM_DAYS ?? mission.horizonDays));
    const budget = createBudget(mission.budgetUnits);

    // Provisioning is a STEP (returns a path — the Workspace object itself
    // must never cross a step boundary: DBOS serializes step outputs, and
    // functions do not survive). Attach happens in-process.
    const wsRoot = await DBOS.runStep(
      () =>
        provisionWorkspace(`mission-${wf}`, REPO_ROOT, {
          setupCommands: ["npm install --no-audit --no-fund --loglevel=error"],
        }),
      { name: "workspace" },
    );
    ACTIVE_WS = attachWorkspace(`mission-${wf}`, wsRoot);
    await DBOS.runStep(
      () => emit({ type: EventType.Log, workflowId: wf, level: "info", message: `workspace ready at ${ACTIVE_WS!.root}` }),
      { name: "workspace-log" },
    );

    let state = { version: 1, goal: mission.goal, day: 0, priorities: [], log: [] as unknown[] };
    const verdicts: { day: number; verdict: string }[] = [];

    for (let day = 1; day <= horizon; day++) {
      // 1. Time advances; the change stream fires.
      const due = entriesDue(mission, day);
      await DBOS.runStep(
        () =>
          emit({
            type: EventType.SimDayStarted,
            workflowId: wf,
            day,
            of: horizon,
            due: due.map((e) => ({ id: e.id, title: e.title, kind: e.kind })),
          }),
        { name: `day-start-${day}` },
      );
      for (const e of due) {
        await DBOS.runStep(
          () =>
            emit(
              e.kind === "incident"
                ? { type: EventType.IncidentRaised, workflowId: wf, day, id: e.id, title: e.title, detail: e.detail }
                : { type: EventType.RequirementChanged, workflowId: wf, day, id: e.id, title: e.title, detail: e.detail },
            ),
          { name: `change-${e.id}` },
        );
      }

      if (budget.left() <= 0) break;

      // 2. COORDINATOR plans the day.
      const status = await DBOS.runStep(
        () => ACTIVE_WS!.readFile("sim/mission-state.json").catch(() => "(none yet)"),
        { name: `read-state-${day}` },
      );
      const commits = await DBOS.runStep(() => ACTIVE_WS!.gitLog(8), { name: `read-log-${day}` });
      const plan = await DBOS.runStep(() => planDay(mission, day, due, status, commits), {
        name: `plan-${day}`,
      });
      await DBOS.runStep(
        () =>
          emit({
            type: EventType.PlanCreated,
            workflowId: wf,
            steps: plan.steps.map((s, i) => ({ id: `d${day}-${i}`, agent: s.role, objective: s.objective })),
          }),
        { name: `plan-emit-${day}` },
      );

      // 3. DISPATCH — roles run sequentially (they share one workspace).
      const outcomes: { role: string; findings: string }[] = [];
      for (const [i, s] of plan.steps.entries()) {
        if (!(await chargeStep(budget, wf, 1, `d${day} role:${s.role}`))) break;
        const stepId = `d${day}-${i}`;
        await DBOS.runStep(
          () =>
            emit({
              type: EventType.SubagentStarted,
              workflowId: wf,
              stepId,
              agent: s.role,
              objective: s.objective,
            }),
          { name: `sub-start-${stepId}` },
        );
        try {
          const findings = await DBOS.runStep(() => runRole(s.role as DispatchRole, s.objective), {
            name: `role-${stepId}`,
          });
          await DBOS.runStep(
            () => emit({ type: EventType.SubagentCompleted, workflowId: wf, stepId, agent: s.role, findings }),
            { name: `sub-done-${stepId}` },
          );
          outcomes.push({ role: s.role, findings });
        } catch (err) {
          await DBOS.runStep(
            () =>
              emit({
                type: EventType.SubagentFailed,
                workflowId: wf,
                stepId,
                agent: s.role,
                error: String(err).slice(0, 500),
              }),
            { name: `sub-fail-${stepId}` },
          );
          outcomes.push({ role: s.role, findings: `FAILED: ${String(err).slice(0, 500)}` });
        }
      }

      // 4. VERIFY — an independent judgment over the day's completion claim.
      if (await chargeStep(budget, wf, 1, `d${day} verify`)) {
        const claim = [
          `Day ${day} of mission "${mission.name}" is complete.`,
          `Due today: ${due.map((e) => `${e.id} (${e.title})`).join("; ") || "(nothing new)"}.`,
          `Role reports:`,
          ...outcomes.map((o) => `[${o.role}] ${o.findings.slice(0, 900)}`),
        ].join("\n");
        const verdict = await verifyDay({ claimId: `d${day}`, by: "day crew", claim });
        verdicts.push({ day, verdict: verdict.verdict });

        // 5. Checkpoint ONLY on a verified pass (the operator's rule).
        if (verdict.verdict === "pass") {
          const ref = await DBOS.runStep(() => ACTIVE_WS!.checkpoint(`day-${day}-verified`), {
            name: `checkpoint-${day}`,
          });
          await DBOS.runStep(
            () => emit({ type: EventType.CheckpointTaken, workflowId: wf, label: `day-${day}-verified`, ref }),
            { name: `checkpoint-emit-${day}` },
          );
        }
      }

      // 6. Persist mission state (the coordinator's durable goal state).
      state = {
        ...state,
        day,
        log: [...state.log, { day, due: due.map((e) => e.id), verdict: verdicts.at(-1)?.verdict ?? "skipped" }],
      };
      await DBOS.runStep(
        () => ACTIVE_WS!.writeFile("sim/mission-state.json", JSON.stringify(state, null, 2)),
        { name: `state-${day}` },
      );
      await DBOS.runStep(
        () => emit({ type: EventType.MissionStateUpdated, workflowId: wf, day, state }),
        { name: `state-emit-${day}` },
      );

      // 7. Pace: end of the simulated day (durable sleep — crash-safe).
      if (day < horizon) await DBOS.sleep(SIM_DAY_MS);
    }

    const passed = verdicts.filter((v) => v.verdict === "pass").length;
    const failed = verdicts.filter((v) => v.verdict === "fail").length;
    return [
      `Mission "${mission.name}" finished.`,
      `Days run: ${verdicts.length}/${horizon}. Verified green: ${passed}. Verification failures: ${failed}. Challenged: ${verdicts.filter((v) => v.verdict === "challenge").length}.`,
      `Budget used: ${budget.used()}/${budget.limit} units.`,
      `Verdicts: ${verdicts.map((v) => `d${v.day}:${v.verdict}`).join(" ") || "(none)"}.`,
    ].join("\n");
  },
  { name: "sustainMissionWorkflow" },
);
