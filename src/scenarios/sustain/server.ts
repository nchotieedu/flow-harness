// MUST be first: loads .dev.vars before any module that reads env at load time.
import "../../env";

import { DBOS } from "@dbos-inc/dbos-sdk";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ensureSchema, clearEventLog } from "@harness/db";
import { subscribe, history } from "@harness/bus";
import { sustainMissionWorkflow } from "./workflows";
import { DEFAULT_MISSION } from "./mission";
import type { ClientMessage } from "@harness/events";

const PORT = Number(process.env.PORT ?? 8797);

async function main() {
  await ensureSchema();

  // Point DBOS at the same Postgres for its checkpoint store, then launch it.
  // launch() ALSO recovers any workflows that were mid-flight when the process
  // last died, resuming each from its last completed step.
  DBOS.setConfig({ name: "flow-harness", systemDatabaseUrl: process.env.DATABASE_URL });
  await DBOS.launch();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // inspector runs on a different port
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/clear", async (_req, res) => {
    await clearEventLog();
    res.json({ ok: true });
  });

  app.post("/api/approve/:workflowId", async (req, res) => {
    const approved = Boolean(req.body?.approved);
    await DBOS.send(req.params.workflowId, { approved }, "approval");
    res.json({ ok: true });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  subscribe((event) => {
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  });

  wss.on("connection", async (socket: WebSocket) => {
    socket.on("message", async (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "submit_task") {
        const missionName = message.input?.trim() || DEFAULT_MISSION;
        await DBOS.startWorkflow(sustainMissionWorkflow)(missionName);
      }
    });

    socket.send(JSON.stringify({ type: "history", events: await history() }));
  });

  server.listen(PORT, () => {
    console.log(`harness server listening on http://localhost:${PORT}  (ws: /ws)`);
    console.log(`mission queue: submit a mission name (default: ${DEFAULT_MISSION})`);
  });
}

main().catch((error) => {
  console.error("server failed:", error);
  process.exit(1);
});
