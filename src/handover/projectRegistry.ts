import type * as vscode from "vscode";

const KEY = "factory.projectRegistry";

type Factory = "aifactory" | "tfactory";

interface Entry {
  aifactory?: string;
  tfactory?: string;
}

type Registry = Record<string, Entry>;

export class ProjectRegistry {
  constructor(private readonly state: vscode.ExtensionContext["globalState"]) {}

  get(remoteUrl: string, factory: Factory): string | undefined {
    return this.all()[remoteUrl]?.[factory];
  }

  set(remoteUrl: string, factory: Factory, projectId: string): void {
    const reg = this.all();
    const entry: Entry = { ...reg[remoteUrl] };
    entry[factory] = projectId;
    reg[remoteUrl] = entry;
    void this.state.update(KEY, reg);
  }

  invalidate(remoteUrl: string, factory: Factory): void {
    const reg = this.all();
    if (reg[remoteUrl]) {
      const entry: Entry = { ...reg[remoteUrl] };
      delete entry[factory];
      reg[remoteUrl] = entry;
      void this.state.update(KEY, reg);
    }
  }

  private all(): Registry {
    return (this.state.get<Registry>(KEY) ?? {});
  }
}
