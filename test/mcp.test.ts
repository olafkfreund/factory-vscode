import { test } from "node:test";
import assert from "node:assert/strict";
import { cfactoryMcpUrl, mcpHeaders } from "../src/mcp/url";

test("cfactoryMcpUrl appends /mcp and trims trailing slashes", () => {
  assert.equal(cfactoryMcpUrl("http://localhost:3111"), "http://localhost:3111/mcp");
  assert.equal(cfactoryMcpUrl("https://cf.example.com/"), "https://cf.example.com/mcp");
});

test("mcpHeaders only includes Authorization when a token is set", () => {
  assert.deepEqual(mcpHeaders("secret"), { Authorization: "Bearer secret" });
  assert.deepEqual(mcpHeaders(undefined), {});
});
