import WebSocket from "ws";
import { toWsOrigin } from "./liveSocket";

export interface ConsoleHandlers {
  onData: (chunk: Buffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * Read-only stream of one agent's console (ANSI bytes) from CFactory's
 * token-safe live-agents proxy. The host holds the socket and token; bytes
 * are forwarded to the webview terminal. No reconnect: a closed console
 * normally means the agent task ended.
 */
export class ConsoleSocket {
  private ws: WebSocket | null = null;
  private closedByCaller = false;

  constructor(
    baseUrl: string,
    wsPath: string,
    getToken: () => Promise<string | undefined> | string | undefined,
    private readonly handlers: ConsoleHandlers,
    wsImpl: typeof WebSocket = WebSocket,
  ) {
    const path = wsPath.startsWith("/") ? wsPath : `/${wsPath}`;
    const url = `${toWsOrigin(baseUrl)}${path}`;
    void Promise.resolve(getToken()).then((token) => {
      if (this.closedByCaller) {
        return;
      }
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const ws = new wsImpl(url, { headers });
      ws.binaryType = "nodebuffer";
      this.ws = ws;
      ws.on("open", () => this.handlers.onOpen?.());
      ws.on("message", (data: WebSocket.RawData) => {
        this.handlers.onData(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      });
      ws.on("error", () => {
        try {
          ws.close();
        } catch {
          /* onclose handles it */
        }
      });
      ws.on("close", () => this.handlers.onClose?.());
    });
  }

  close(): void {
    this.closedByCaller = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
