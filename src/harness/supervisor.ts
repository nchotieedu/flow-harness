import { DBOS } from "@dbos-inc/dbos-sdk";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { EventType } from "@harness/events";
import { emit } from "./bus";
import { model } from "./model";

// ── The generic supervisor pattern ──────────────────────────────────────────
//
// Plan → dispatch sub-agents in parallel → fan in → synthesize. Unlike a
// handoff, the supervisor keeps control the whole time.
//
// The harness owns the STRUCTURE; a scenario plugs in:
//   · departments          — the specialist roles a plan may dispatch to
//   · runInvestigator      — how one sub-agent investigates (its own context)
//   · planSystem           — how an objective is decomposed
//   · synthesizeSystem     — how findings are aggregated into one reply
//   · caller               — who the final reply is for (label in the prompt)

export type SupervisorWorkflowOptions = {
  departments: [string, ...string[]];
  runInvestigator: (agent: string, objective: string) => Promise<string>;
  planSystem?: string;
  synthesizeSystem?: string;
  caller?: string;
  subjectLabel?: string;
};

export function createSupervisorWorkflow(options: SupervisorWorkflowOptions) {
  const {
    departments,
    runInvestigator,
    planSystem = `Decompose the objective into independent sub-tasks — one per department the objective actually raises (${departments.join(" / ")}). Only include relevant departments.`,
    synthesizeSystem = "You are the lead. Using your department agents' findings, write ONE clear decision that addresses every point raised. If a department's investigation is missing, acknowledge it briefly and say you'll follow up.",
    caller = "the company",
    subjectLabel = "Objective",
  } = options;

  const PlanSchema = z.object({
    steps: z.array(
      z.object({
        id: z.string().describe("short id, e.g. 'tech'"),
        agent: z.enum(departments),
        objective: z.string().describe("what this sub-agent should find out"),
      }),
    ),
  });
  type Plan = z.infer<typeof PlanSchema>;

  async function makePlan(task: string): Promise<Plan> {
    const { object } = await generateObject({
      model,
      schema: PlanSchema,
      system: planSystem,
      prompt: task,
    });
    return object;
  }

  async function synthesize(
    task: string,
    findings: { agent: string; findings: string }[],
  ): Promise<string> {
    const { text } = await generateText({
      model,
      system: synthesizeSystem,
      prompt: `${subjectLabel}:\n${task}\n\nDepartment findings:\n${
        findings.map((f) => `[${f.agent}] ${f.findings}`).join("\n\n") || "(none)"
      }`,
    });
    return text;
  }

  async function workflow(task: string): Promise<string> {
    const workflowId = DBOS.workflowID ?? "unknown";
    await DBOS.runStep(
      () => emit({ type: EventType.WorkflowStarted, workflowId, input: task }),
      { name: "started" },
    );

    // PLAN.
    const plan = await DBOS.runStep(() => makePlan(task), { name: "plan" });
    await DBOS.runStep(
      () => emit({ type: EventType.PlanCreated, workflowId, steps: plan.steps }),
      { name: "plan-emit" },
    );

    // DISPATCH — every sub-agent runs in parallel, each in its own context window.
    const settled = await Promise.allSettled(
      plan.steps.map((s) =>
        DBOS.runStep(
          async () => {
            await emit({
              type: EventType.SubagentStarted,
              workflowId,
              stepId: s.id,
              agent: s.agent,
              objective: s.objective,
            });
            const findings = await runInvestigator(s.agent, s.objective);
            await emit({
              type: EventType.SubagentCompleted,
              workflowId,
              stepId: s.id,
              agent: s.agent,
              findings,
            });
            return { agent: s.agent, findings };
          },
          { name: `subagent-${s.id}` },
        ),
      ),
    );

    // FAN-IN — collect successes, record failures, and keep going (degrade).
    const findings: { agent: string; findings: string }[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const step = plan.steps[i];
      if (result.status === "fulfilled") {
        findings.push(result.value);
      } else {
        await DBOS.runStep(
          () =>
            emit({
              type: EventType.SubagentFailed,
              workflowId,
              stepId: step.id,
              agent: step.agent,
              error: String(result.reason),
            }),
          { name: `subagent-failed-${step.id}` },
        );
      }
    }

    // SYNTHESIZE.
    const reply = await DBOS.runStep(() => synthesize(task, findings), { name: "synthesize" });
    await DBOS.runStep(
      () => emit({ type: EventType.ModelCompleted, workflowId, text: reply }),
      { name: "synth" },
    );
    await DBOS.runStep(
      () => emit({ type: EventType.WorkflowCompleted, workflowId, output: reply }),
      { name: "completed" },
    );
    return reply;
  }

  return workflow;
}
