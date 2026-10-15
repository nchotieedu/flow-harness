import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── The workspace: real file state under harness control ────────────────────
//
// Sustained work (build, migrate, deploy, restore) needs REAL file state —
// not a chat transcript. The workspace is an isolated copy of a source tree
// (e.g. the repo itself) per mission run:
//
//   · isolated  — agents never touch the live repo; a Builder mistake cannot
//                 kill the lab. `.workspaces/<runId>/` (gitignored).
//   · real git  — checkpoints are actual commits; restore is `git reset --hard`.
//   · inspectable — workspaces are kept on disk after the run for research.
//
// The harness owns the boundary: it decides how state is created, snapshotted
// and restored. Raw command execution is a PRIMITIVE here — the scenario
// decides the allowlist (see src/scenarios/*/tools.ts).

const execAsync = promisify(exec);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACES_ROOT = path.join(REPO_ROOT, ".workspaces");

const EXCLUDED = ["node_modules", ".git", ".workspaces", ".dev.vars", "dist"];
const GIT_IDENTITY = ["-c", "user.name=flow-harness", "-c", "user.email=harness@local"];

export type CommandResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

export type Workspace = {
  runId: string;
  root: string;
  readFile: (relPath: string) => Promise<string>;
  writeFile: (relPath: string, content: string) => Promise<void>;
  listDir: (relPath: string) => Promise<string[]>;
  runCommand: (command: string, timeoutMs?: number) => Promise<CommandResult>;
  checkpoint: (label: string) => Promise<string>;
  restore: (ref: string) => Promise<void>;
  gitLog: (maxCount?: number) => Promise<string>;
};

function resolveSafe(root: string, relPath: string): string {
  const target = path.resolve(root, relPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`path escapes the workspace: ${relPath}`);
  }
  return target;
}

// Provision the workspace: all side effects (copy, git init, setup commands).
// Returns the root PATH only — never the Workspace object, because DBOS
// serializes step outputs and functions would not survive (attach in-process
// afterwards with `attachWorkspace`).
export async function provisionWorkspace(
  runId: string,
  sourceDir: string,
  opts: { setupCommands?: string[] } = {},
): Promise<string> {
  const root = path.join(WORKSPACES_ROOT, runId);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  // Copy the source tree (excluding heavy/sensitive dirs), then make it a real
  // git repo so checkpoints and restores are genuine version control. Copy
  // top-level children individually: the destination may live INSIDE the
  // source tree (`.workspaces/` in the repo), which cpSync refuses wholesale.
  fs.mkdirSync(root, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (EXCLUDED.includes(entry.name)) continue;
    fs.cpSync(path.join(sourceDir, entry.name), path.join(root, entry.name), {
      recursive: true,
      verbatimSymlinks: false,
    });
  }
  for (const cmd of [
    `git init -q`,
    `git add -A`,
    `git ${GIT_IDENTITY.join(" ")} commit -q --allow-empty -m "workspace seed"`,
  ]) {
    await execAsync(cmd, { cwd: root });
  }

  // Scenario-provided environment setup (e.g. `npm install`), so tools like
  // typecheck/test runs work against REAL dependencies inside the workspace.
  for (const cmd of opts.setupCommands ?? []) {
    await execAsync(cmd, { cwd: root, timeout: 600_000 });
  }

  return root;
}

// Attach to a provisioned workspace IN-PROCESS. Pure — no side effects, no
// serialization. Build one per run and keep it OUT of step inputs/outputs.
export function attachWorkspace(runId: string, root: string): Workspace {
  const git = async (args: string): Promise<string> => {
    const { stdout } = await execAsync(`git ${GIT_IDENTITY.join(" ")} ${args}`, { cwd: root });
    return stdout.trim();
  };

  return {
    runId,
    root,

    async readFile(relPath) {
      return fs.promises.readFile(resolveSafe(root, relPath), "utf8");
    },

    async writeFile(relPath, content) {
      const target = resolveSafe(root, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    },

    async listDir(relPath) {
      const target = resolveSafe(root, relPath === "" ? "." : relPath);
      return fs
        .readdirSync(target, { withFileTypes: true })
        .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
        .sort();
    },

    async runCommand(command, timeoutMs = 120_000) {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: root,
          timeout: timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: 8 * 1024 * 1024,
        });
        return { ok: true, code: 0, stdout, stderr };
      } catch (err) {
        const e = err as { code?: number; stdout?: string; stderr?: string; message: string };
        return {
          ok: false,
          code: e.code ?? 1,
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? e.message,
        };
      }
    },

    async checkpoint(label) {
      await execAsync(
        `git ${GIT_IDENTITY.join(" ")} add -A && git ${GIT_IDENTITY.join(" ")} commit -q -m "checkpoint: ${label.replace(/"/g, "'")}" --allow-empty`,
        { cwd: root },
      );
      return git("rev-parse --short HEAD");
    },

    async restore(ref) {
      await execAsync(`git reset --hard ${JSON.stringify(ref)}`, { cwd: root });
    },

    async gitLog(maxCount = 10) {
      return git(`log --oneline -n ${maxCount}`);
    },
  };
}

export { REPO_ROOT, WORKSPACES_ROOT, createWorkspace };

// Convenience for non-durable contexts: provision + attach in one call.
async function createWorkspace(
  runId: string,
  sourceDir: string,
  opts: { setupCommands?: string[] } = {},
): Promise<Workspace> {
  const root = await provisionWorkspace(runId, sourceDir, opts);
  return attachWorkspace(runId, root);
}
