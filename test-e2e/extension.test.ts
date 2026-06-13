import * as assert from "assert";
import * as vscode from "vscode";

// Mocha TDD globals (suite/test) are provided by @vscode/test-cli at runtime.
const EXT_ID = "olafkfreund.factory-vscode";

// Every command the extension contributes (kept in lockstep with package.json
// contributes.commands). A real VS Code instance is the only place a bad
// `when`/menu/contribution surfaces, so we assert the full set here.
const ALL_COMMANDS = [
  "factory.openCockpit",
  "factory.connect",
  "factory.refresh",
  "factory.openConsole",
  "factory.openWorkItemOnGitHub",
  "factory.setToken",
  "factory.connectViaBrowser",
  "factory.getToken",
  "factory.login",
  "factory.logout",
  "factory.createPlan",
  "factory.resumePlanSession",
  "factory.sendToCode",
  "factory.sendToTest",
  "factory.onboardProject",
  "factory.createCodeTask",
  "factory.createTestTask",
  "factory.reviewTask",
  "factory.toggleMute",
  "factory.stopTask",
  "factory.viewLogs",
  "factory.disconnect",
  "factory.showProject",
  "factory.forgetProject",
  "factory.submitComposeBuffer",
];

suite("factory-vscode activation", () => {
  test("activates and registers every contributed command", async () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, "extension is installed");
    await ext!.activate();
    assert.ok(ext!.isActive, "extension activated");

    const commands = await vscode.commands.getCommands(true);
    for (const id of ALL_COMMANDS) {
      assert.ok(commands.includes(id), `command ${id} is registered`);
    }
  });

  test("opening the cockpit renders the webview without throwing", async () => {
    // Exercises the webview HTML/CSP/protocol path in a real VS Code window —
    // the surface a headless unit test can't reach. Panel creation must not
    // throw; we don't drive a live connection here.
    await vscode.commands.executeCommand("factory.openCockpit");
    // Give the webview a beat to load its assets, then ensure the host is still
    // responsive (no crash from the panel/CSP).
    await new Promise((r) => setTimeout(r, 500));
    const stillResponsive = await vscode.commands.getCommands(true);
    assert.ok(
      stillResponsive.includes("factory.openCockpit"),
      "host still responsive after opening the cockpit",
    );
  });
});
