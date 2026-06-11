import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { RestClient, FactoryHttpError } from "../src/cfactory/restClient";
import type { WorkItem } from "../src/cfactory/types";

const SAMPLE: WorkItem = {
  correlation_key: "142",
  title: "Add rate limiting",
  pfactory: { task_id: "p1", status: "emitted", phase: "emit" },
  aifactory: { task_id: "a1", status: "in_progress", phase: "act" },
  tfactory: { task_id: null, status: null, phase: null },
  timeline: [{ service: "pfactory", status: "emitted", phase: "emit", updated_at: "2026-06-11T08:00:00Z" }],
};

/** Spin up a mock CFactory that requires a bearer token. */
function mockServer(): Promise<{ url: string; close: () => void; lastAuth: () => string | undefined }> {
  let lastAuth: string | undefined;
  const server = http.createServer((req, res) => {
    lastAuth = req.headers.authorization;
    if (!lastAuth) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/workitems") {
      res.end(JSON.stringify({ count: 1, items: [SAMPLE] }));
    } else if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", service: "cfactory", version: "1.0", upstreams: {} }));
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
        lastAuth: () => lastAuth,
      });
    });
  });
}

test("workItems() parses items and forwards the bearer token", async () => {
  const srv = await mockServer();
  try {
    const client = new RestClient({ baseUrl: srv.url, getToken: () => "secret" });
    const items = await client.workItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].correlation_key, "142");
    assert.equal(items[0].aifactory.status, "in_progress");
    assert.equal(srv.lastAuth(), "Bearer secret");
  } finally {
    srv.close();
  }
});

test("health() works against the mock", async () => {
  const srv = await mockServer();
  try {
    const client = new RestClient({ baseUrl: srv.url, getToken: () => "secret" });
    const h = await client.health();
    assert.equal(h.service, "cfactory");
  } finally {
    srv.close();
  }
});

test("missing token yields an unauthorized FactoryHttpError", async () => {
  const srv = await mockServer();
  try {
    const client = new RestClient({ baseUrl: srv.url, getToken: () => undefined });
    await assert.rejects(
      () => client.workItems(),
      (err: unknown) => err instanceof FactoryHttpError && err.isUnauthorized,
    );
  } finally {
    srv.close();
  }
});

test("trailing slash in baseUrl is normalized", async () => {
  const srv = await mockServer();
  try {
    const client = new RestClient({ baseUrl: `${srv.url}/`, getToken: () => "secret" });
    const items = await client.workItems();
    assert.equal(items.length, 1);
  } finally {
    srv.close();
  }
});
