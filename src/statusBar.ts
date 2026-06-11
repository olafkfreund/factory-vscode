import * as vscode from "vscode";

export type ConnectionState = "offline" | "connecting" | "connected";

/** Status bar item showing connection state and running/anomaly counts. */
export class FactoryStatusBar {
  private readonly item: vscode.StatusBarItem;
  private state: ConnectionState = "offline";
  private running = 0;
  private anomalies = 0;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "factory.openCockpit";
    this.render();
    this.item.show();
  }

  setState(state: ConnectionState): void {
    this.state = state;
    this.render();
  }

  setCounts(running: number, anomalies: number): void {
    this.running = running;
    this.anomalies = anomalies;
    this.render();
  }

  private render(): void {
    if (this.state === "offline") {
      this.item.text = "$(plug) Factory: offline";
      this.item.tooltip = "Factory is not connected to CFactory. Click to open the cockpit.";
      return;
    }
    if (this.state === "connecting") {
      this.item.text = "$(sync~spin) Factory: connecting";
      this.item.tooltip = "Connecting to CFactory...";
      return;
    }
    const spin = this.running > 0 ? "$(sync~spin)" : "$(pulse)";
    const anomalyPart = this.anomalies > 0 ? `  $(warning) ${this.anomalies}` : "";
    this.item.text = `${spin} Factory: ${this.running} running${anomalyPart}`;
    this.item.tooltip = `${this.running} running, ${this.anomalies} anomalies. Click to open the cockpit.`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
