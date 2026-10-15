import { DBOS } from "@dbos-inc/dbos-sdk";
import { EventType } from "@harness/events";
import { emit } from "./bus";

// ── The compute budget ──────────────────────────────────────────────────────
//
// "Fixed compute budget" is a research VARIABLE, not a fixed number: units are
// role-runs (one agent invocation ≈ one bounded model loop). The mission
// workflow charges before each dispatch and STOPS when the budget is gone.
//
// Why a plain counter is sound here: it lives inside the durable mission
// workflow. On recovery DBOS re-executes from the last completed step, and
// every charge is a cached step — so `used` replays to exactly the same value.

export type Budget = {
  limit: number;
  used: () => number;
  left: () => number;
  /** Charge units; returns false (and emits budget.exhausted once) when over. */
  charge: (units: number, reason: string, workflowId: string) => Promise<boolean>;
};

export function createBudget(limit: number): Budget {
  let used = 0;
  let exhaustedAnnounced = false;

  return {
    limit,
    used: () => used,
    left: () => Math.max(0, limit - used),

    async charge(units, reason, workflowId) {
      used += units;
      const remaining = Math.max(0, limit - used);
      await emit({ type: EventType.BudgetCharged, workflowId, units, reason, remaining });
      if (remaining <= 0 && !exhaustedAnnounced) {
        exhaustedAnnounced = true;
        await emit({ type: EventType.BudgetExhausted, workflowId, units: used, limit });
      }
      return remaining > 0;
    },
  };
}

/** Charge as a DBOS step so recovery replays it exactly once. */
export async function chargeStep(
  budget: Budget,
  workflowId: string,
  units: number,
  reason: string,
): Promise<boolean> {
  return DBOS.runStep(() => budget.charge(units, reason, workflowId), {
    name: `budget-charge-${reason.replace(/\s+/g, "-")}`,
  });
}
