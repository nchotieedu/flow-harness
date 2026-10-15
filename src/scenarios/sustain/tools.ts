import { tool } from "ai";
import { z } from "zod";
import type { ToolSet } from "ai";
import type { Workspace } from "@harness/workspace";

// ── Sustain scenario tools ──────────────────────────────────────────────────
//
// All tools operate on the run's ISOLATED WORKSPACE (a real git clone of this
// repository). The harness workspace owns the boundary; this file decides who
// sees what, and which commands the allowlist permits.
//
// Tools receive a WORKSPACE GETTER, not a workspace: tool surfaces are built
// once at module load, but the workspace exists per mission run. The getter
// resolves it lazily on every tool call.

// Only commands that are safe, bounded, and meaningful for maintaining THIS
// repository. Anything else is refused — the agent can ask, the harness
// decides.
const COMMAND_ALLOWLIST: RegExp[] = [
  /^npm run (typecheck|test:sandbox)$/,
  /^npm install$/,
  /^node --version$/,
  /^git (status|diff|log|show)( .*)?$/,
  /^git add( -A)?$/,
  /^git commit( -q)?( -m)?( '[^']*'| "[^"]*")?$/,
  /^git rev-parse( --short)? HEAD$/,
];

function commandAllowed(command: string): boolean {
  return COMMAND_ALLOWLIST.some((re) => re.test(command.trim()));
}

const STR_MAX = 20_000;
const clip = (s: string) => (s.length > STR_MAX ? s.slice(0, STR_MAX) + "…[clipped]" : s);

type GetWs = () => Workspace;

// ── Role tool surfaces ──────────────────────────────────────────────────────

const READ_TOOLS = (getWs: GetWs): ToolSet => ({
  listFiles: tool({
    description: "List a directory in the workspace (e.g. 'src/harness').",
    inputSchema: z.object({ path: z.string().default(".") }),
    execute: async ({ path: p }) => ({ files: await getWs().listDir(p) }),
  }),
  readFile: tool({
    description: "Read a file from the workspace (e.g. 'package.json').",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path: p }) => ({ content: clip(await getWs().readFile(p)) }),
  }),
  gitLog: tool({
    description: "Show recent workspace commits (checkpoints and builds).",
    inputSchema: z.object({}),
    execute: async () => ({ log: await getWs().gitLog(15) }),
  }),
});

const CHECK_TOOLS = (getWs: GetWs): ToolSet => ({
  runCommand: tool({
    description:
      "Run an allowlisted command in the workspace: npm run typecheck, npm run test:sandbox, npm install, git status/diff/log/add/commit.",
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      if (!commandAllowed(command)) {
        return { refused: true, reason: `command not allowlisted: ${command}` };
      }
      const r = await getWs().runCommand(command);
      return { ok: r.ok, code: r.code, stdout: clip(r.stdout), stderr: clip(r.stderr) };
    },
  }),
});

const WRITE_TOOLS = (getWs: GetWs): ToolSet => ({
  writeFile: tool({
    description:
      "Write a file in the workspace (create or overwrite). Keep edits minimal and coherent.",
    inputSchema: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ path: p, content }) => {
      await getWs().writeFile(p, content);
      return { ok: true, path: p, bytes: content.length };
    },
  }),
  checkpoint: tool({
    description:
      "Commit all workspace changes as a named checkpoint. NEVER checkpoint a state that fails typecheck.",
    inputSchema: z.object({ label: z.string() }),
    execute: async ({ label }) => {
      const ref = await getWs().checkpoint(label);
      return { ok: true, label, ref };
    },
  }),
  restore: tool({
    description:
      "Restore the workspace to a checkpoint ref (last resort when a change broke things).",
    inputSchema: z.object({ ref: z.string() }),
    execute: async ({ ref }) => {
      await getWs().restore(ref);
      return { ok: true, restoredTo: ref };
    },
  }),
});

export function roleTools(role: string, getWs: GetWs): ToolSet {
  switch (role) {
    case "coordinator":
      return {
        ...READ_TOOLS(getWs),
        ...WRITE_TOOLS(getWs),
        writeFileState: tool({
          description:
            "Update sim/mission-state.json — the durable mission state (goal, priorities, statuses).",
          inputSchema: z.object({ state: z.string().describe("full JSON document") }),
          execute: async ({ state }) => {
            JSON.parse(state); // refuse invalid JSON
            await getWs().writeFile("sim/mission-state.json", state);
            return { ok: true };
          },
        }),
      };
    case "investigator":
      return READ_TOOLS(getWs);
    case "architect":
      return { ...READ_TOOLS(getWs), ...WRITE_TOOLS(getWs) };
    case "builder":
      return { ...READ_TOOLS(getWs), ...CHECK_TOOLS(getWs), ...WRITE_TOOLS(getWs) };
    case "operator":
      return { ...READ_TOOLS(getWs), ...CHECK_TOOLS(getWs), ...WRITE_TOOLS(getWs) };
    case "verifier":
      return READ_TOOLS(getWs);
    default:
      return READ_TOOLS(getWs);
  }
}
