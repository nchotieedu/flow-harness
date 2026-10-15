import { generateObject } from "ai";
import { z } from "zod";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { EventType } from "@harness/events";
import { emit } from "./bus";
import { model } from "./model";

// ── The independent verifier ────────────────────────────────────────────────
//
// The research question is whether agents can SUSTAIN work — which requires
// telling actual success from convincing reports. The verifier is deliberately
// SEPARATE from the builders:
//
//   · it does not share memory with the builders — only their claim text
//   · its mechanical checks are real (the scenario plugs in test/typecheck runs)
//   · a model judgment may CHALLENGE even a green check-run (a passing build
//     does not prove the requirement was implemented)
//
// Verdicts are events, so the lie detector question — "did claims match
// reality?" — is answerable from the log alone.

export type Claim = { claimId: string; by: string; claim: string };

export type MechanicalCheck = (claim: Claim) => Promise<{
  passed: boolean;
  evidence: string;
}>;

export type VerifierWorkflowOptions = {
  runChecks: MechanicalCheck;
  judgeSystem?: string;
  maxEvidenceChars?: number;
};

const JudgeSchema = z.object({
  verdict: z.enum(["pass", "fail", "challenge"]),
  reason: z.string().describe("one paragraph: what the claim got right or wrong"),
});

const DEFAULT_JUDGE = `You are an INDEPENDENT verifier. You receive a completion claim and real
evidence (check output, diffs, logs). Your job is to find the gap between what
was CLAIMED and what the evidence SUPPORTS.

Judge only from evidence — never from how confident the claim sounds. Fail the
claim if a stated outcome is not backed; challenge it if evidence is ambiguous
or the claim overreaches. Pass only when the evidence directly supports every
part of the claim.`;

export function createVerifierWorkflow(options: VerifierWorkflowOptions) {
  const { runChecks, judgeSystem = DEFAULT_JUDGE, maxEvidenceChars = 4000 } = options;

  const judge = async (claim: Claim, evidence: string) => {
    try {
      const { object } = await generateObject({
        model,
        schema: JudgeSchema,
        system: judgeSystem,
        prompt: `Completion claim by "${claim.by}" (${claim.claimId}):\n${claim.claim}\n\nEvidence:\n${evidence.slice(0, maxEvidenceChars) || "(none collected)"}`,
      });
      return object;
    } catch (err) {
      // Graceful degradation: no verdict is not a pass. Challenge it.
      return {
        verdict: "challenge" as const,
        reason: `judge model returned no usable verdict (${String(err).slice(0, 120)}) — human or re-run needed`,
      };
    }
  };

  async function workflow(input: Claim & { workflowDay?: number }): Promise<{
    verdict: "pass" | "fail" | "challenge";
    evidence: string;
  }> {
    const workflowId = DBOS.workflowID ?? "unknown";
    const { claimId, by, claim } = input;

    await emit({ type: EventType.VerificationStarted, workflowId, claimId, by, claim });

    // 1. Mechanical checks — REAL commands against REAL state.
    const check = await DBOS.runStep(() => runChecks({ claimId, by, claim }), {
      name: `verify-checks-${claimId}`,
    });

    // 2. Independent judgment over claim + evidence.
    const judgment = await DBOS.runStep(
      () => judge({ claimId, by, claim }, check.evidence),
      { name: `verify-judge-${claimId}` },
    );

    const evidence = `checks(${check.passed ? "green" : "red"}): ${check.evidence}\nverifier(${judgment.verdict}): ${judgment.reason}`;

    if (!check.passed || judgment.verdict === "fail") {
      await emit({ type: EventType.VerificationFailed, workflowId, claimId, evidence });
      return { verdict: "fail", evidence };
    }
    if (judgment.verdict === "challenge") {
      await emit({ type: EventType.VerificationChallenged, workflowId, claimId, evidence });
      return { verdict: "challenge", evidence };
    }
    await emit({ type: EventType.VerificationPassed, workflowId, claimId, evidence });
    return { verdict: "pass", evidence };
  }

  return workflow;
}
