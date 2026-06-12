import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { LiveSocket, toWsUrl } from "../src/cfactory/liveSocket";
import type { FeedMessage } from "../src/cfactory/types";

test("toWsUrl maps http/https to ws/wss and appends /api/ws", () => {
  assert.equal(toWsUrl("http://localhost:3111"), "ws://localhost:3111/api/ws");
  assert.equal(toWsUrl("https://cf.example.com/"), "wss://cf.example.com/api/ws");
});

test("receives and parses a snapshot frame", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const port = (wss.address() as AddressInfo).port;
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "workitem", item: { correlation_key: "9" } }));
  });

  const got = await new Promise<FeedMessage>((resolve) => {
    const sock = new LiveSocket({
      baseUrl: `http://127.0.0.1:${port}`,
      onMessage: (msg) => {
        sock.close();
        resolve(msg);
      },
    });
  });
  wss.close();

  assert.equal(got.type, "workitem");
  assert.equal((got as { item: { correlation_key: string } }).item.correlation_key, "9");
});

test("stops retrying and fires onAuthError when the handshake is rejected 401", async () => {
  // A bare HTTP server that rejects the WS upgrade with 401 (never upgrades).
  const http = await import("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(401);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;

  let authErrors = 0;
  let connectAttempts = 0;
  const sock = new LiveSocket({
    baseUrl: `http://127.0.0.1:${port}`,
    onMessage: () => {},
    onClose: () => { connectAttempts++; },
    onAuthError: () => { authErrors++; },
    reconnectInitialMs: 20,
    reconnectMaxMs: 50,
  });

  // Wait long enough that several reconnects would have happened if not stopped.
  await new Promise((r) => setTimeout(r, 250));
  sock.close();
  await new Promise<void>((r) => server.close(() => r()));

  assert.equal(authErrors, 1, "onAuthError fires exactly once");
  assert.ok(connectAttempts <= 1, "does not keep reconnecting after an auth rejection");
});

test("reconnects after the server drops the connection", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const port = (wss.address() as AddressInfo).port;
  let connections = 0;

  const reconnected = new Promise<void>((resolve) => {
    wss.on("connection", (ws) => {
      connections++;
      if (connections === 1) {
        // Drop the first connection to trigger a reconnect.
        ws.close();
      } else {
        resolve();
      }
    });
  });

  const sock = new LiveSocket({
    baseUrl: `http://127.0.0.1:${port}`,
    onMessage: () => {},
    reconnectInitialMs: 20,
    reconnectMaxMs: 50,
  });

  await reconnected;
  sock.close();
  wss.close();
  assert.ok(connections >= 2);
});
