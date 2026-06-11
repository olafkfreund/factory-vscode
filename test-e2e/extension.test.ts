import * as assert from "assert";
import * as vscode from "vscode";

// Mocha TDD globals (suite/test) are provided by @vscode/test-cli at runtime.
suite("factory-vscode activation", () => {
  test("activates and registers the core commands", async () => {
    const ext = vscode.extensions.getExtension("olafkfreund.factory-vscode");
    assert.ok(ext, "extension is installed");
    await ext!.activate();
    assert.ok(ext!.isActive, "extension activated");

    const commands = await vscode.commands.getCommands(true);
    for (const id of ["factory.openCockpit", "factory.connect", "factory.refresh", "factory.setToken", "factory.openConsole"]) {
      assert.ok(commands.includes(id), `command ${id} is registered`);
    }
  });
});
