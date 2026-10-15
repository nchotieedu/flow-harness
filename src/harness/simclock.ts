// ── Simulated time ──────────────────────────────────────────────────────────
//
// Long-horizon research needs a horizon that is CONFIGURABLE, not baked in:
// 20 days, 30 days, 90 days — same code. Simulated time decouples the mission
// clock from wall-clock pacing:
//
//   SIM_DAYS    — how many simulated days a mission runs (default 30)
//   SIM_DAY_MS  — real milliseconds per simulated day (default 60_000)
//
// The mission workflow paces itself with DBOS.sleep(SIM_DAY_MS) at the END of
// each day: the sleep is a durable step, so a crash mid-day resumes without
// re-running completed day work, and pacing never depends on the process
// staying alive.

export const SIM_DAYS = Number(process.env.SIM_DAYS ?? 30);
export const SIM_DAY_MS = Number(process.env.SIM_DAY_MS ?? 60_000);

export type SimDay = { day: number; of: number };

export function simDayLabel({ day, of }: SimDay): string {
  return `day ${day}/${of}`;
}
