import WebSocket from "ws";
import type { FeedMessage } from "./types";

export interface LiveSocketOptions {
  /** CFactory base URL (http/https); the socket connects to its /api/ws. */
  baseUrl: string;
  onMessage: (msg: FeedMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  getToken?: () => Promise<string | undefined> | string | undefined;
  /** Heartbeat interval in ms (default 25000). */
  pingIntervalMs?: number;
  /** Initial reconnect backoff in ms (default 1000). */
  reconnectInitialMs?: number;
  /** Max reconnect backoff in ms (default 15000). */
  reconnectMaxMs?: number;
  /** WebSocket implementation override (tests). */
  wsImpl?: typeof WebSocket;
}

/**
 * Live CFactory feed with keepalive and auto-reconnect. Mirrors the cockpit's
 * client behaviour: a "ping" text frame every 25s, and capped exponential
 * backoff on any close. No `vscode` dependency, so it is unit-testable.
 */
export class LiveSocket {
  private readonly url: string;
  private readonly opts: Required<Omit<LiveSocketOptions, "getToken" | "onOpen" | "onClose">> &
    Pick<LiveSocketOptions, "getToken" | "onOpen" | "onClose">;
  private ws: WebSocket | null = null;
  private closedByCaller = false;
  private backoff: number;
  private pingTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(options: LiveSocketOptions) {
    this.url = toWsUrl(options.baseUrl);
    this.opts = {
      baseUrl: options.baseUrl,
      onMessage: options.onMessage,
      onOpen: options.onOpen,
      onClose: options.onClose,
      getToken: options.getToken,
      pingIntervalMs: options.pingIntervalMs ?? 25_000,
      reconnectInitialMs: options.reconnectInitialMs ?? 1000,
      reconnectMaxMs: options.reconnectMaxMs ?? 15_000,
      wsImpl: options.wsImpl ?? WebSocket,
    };
    this.backoff = this.opts.reconnectInitialMs;
    void this.connect();
  }

  private async connect(): Promise<void> {
    const headers: Record<string, string> = {};
    const token = await this.opts.getToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const ws = new this.opts.wsImpl(this.url, { headers });
    this.ws = ws;

    ws.on("open", () => {
      this.backoff = this.opts.reconnectInitialMs;
      this.opts.onOpen?.();
      this.pingTimer = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.send("ping");
          } catch {
            /* surfaces as a close */
          }
        }
      }, this.opts.pingIntervalMs);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        this.opts.onMessage(JSON.parse(data.toString()) as FeedMessage);
      } catch {
        /* ignore malformed frames */
      }
    });

    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        /* onclose handles retry */
      }
    });

    ws.on("close", () => {
      clearInterval(this.pingTimer);
      this.opts.onClose?.();
      if (this.closedByCaller) {
        return;
      }
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.opts.reconnectMaxMs);
      this.reconnectTimer = setTimeout(() => void this.connect(), delay);
    });
  }

  close(): void {
    this.closedByCaller = true;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

/** http(s)://host -> ws(s)://host/api/ws */
export function toWsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const proto = trimmed.startsWith("https") ? "wss" : "ws";
  const hostPart = trimmed.replace(/^https?/, proto);
  return `${hostPart}/api/ws`;
}
