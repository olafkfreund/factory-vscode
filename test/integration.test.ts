import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { RestClient } from "../src/cfactory/restClient";
import { LiveSocket } from "../src/cfactory/liveSocket";
import { StateStore } from "../src/state/store";
import type { WorkItem } from "../src/cfactory/types";

function wi(key: string, aiStatus: string): WorkItem {
  return {
    correlation_key: key,
    title: `item ${key}`,
    pfactory: { task_id: "p", status: "emitted", phase: "emit" },
    aifactory: { task_id: "a", status: aiStatus, phase: "act" },
    tfactory: { task_id: null, status: null, phase: null },
    timeline: [],
  };
}

/**
 * End-to-end fixture: a mock CFactory (REST + /api/ws on one server) feeds the
 * real RestClient + LiveSocket into the real StateStore, exactly as the
 * extension wires them on connect.
 */
test("REST hydrate + live WS deltas land in the store", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", service: "cfactory", version: "1.0", upstreams: {} }));
    } else if (req.url === "/api/workitems") {
      res.end(JSON.stringify({ count: 1, items: [wi("100", "in_progress")] }));
    } else if (req.url === "/api/anomalies") {
      res.end(JSON.stringify({ anomalies: [{ kind: "stuck", severity: "high", correlation_key: "100", title: null, detail: "stalled" }] }));
    } else {
      res.writeHead(404);
      res.end("{}");
    }
  });
  const wss = new WebSocketServer({ server, path: "/api/ws" });
  wss.on("connection", (ws) => {
    // A new work item, then a progress frame for the hydrated one.
    ws.send(JSON.stringify({ type: "workitem", item: wi("101", "coding") }));
    ws.send(JSON.stringify({ type: "progress", item: { correlation_key: "100", service: "aifactory", phase: "act", percent: 55, updated_at: "" } }));
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const store = new StateStore();
  const client = new RestClient({ baseUrl, getToken: () => undefined });

  // Mirror the extension's connect: hydrate from REST...
  store.hydrate(await client.workItems());
  store.setAnomalies(await client.anomalies());
  assert.equal(store.size, 1);
  assert.equal(store.anomalyCount, 1);
  assert.equal(store.getAnomaly("100")?.kind, "stuck");

  // ...then go live over the WebSocket.
  await new Promise<void>((resolve) => {
    let frames = 0;
    const sock = new LiveSocket({
      baseUrl,
      onMessage: (msg) => {
        store.applyFeed(msg);
        if (++frames >= 2) {
          sock.close();
          resolve();
        }
      },
    });
  });

  assert.equal(store.size, 2, "new work item from the feed was added");
  assert.equal(store.runningCount, 1, "progress frame registered");
  assert.equal(store.getProgress("100")?.percent, 55);

  wss.close();
  await new Promise<void>((r) => server.close(() => r()));
});
