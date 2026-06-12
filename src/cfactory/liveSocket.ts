import WebSocket from "ws";
import type { FeedMessage } from "./types";

export interface LiveSocketOptions {
  /** CFactory base URL (http/https); the socket connects to its /api/ws. */
  baseUrl: string;
  onMessage: (msg: FeedMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Called when the server rejects the connection as unauthorized (stops retrying). */
  onAuthError?: () => void;
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
  private readonly opts: Required<Omit<LiveSocketOptions, "getToken" | "onOpen" | "onClose" | "onAuthError">> &
    Pick<LiveSocketOptions, "getToken" | "onOpen" | "onClose" | "onAuthError">;
  private ws: WebSocket | null = null;
  private closedByCaller = false;
  private authFailed = false;
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
      onAuthError: options.onAuthError,
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

    // The server rejected the handshake (e.g. HTTP 401/403) — stop retrying with
    // the same bad token and let the host prompt for a new one.
    ws.on("unexpected-response", (_req, res: { statusCode?: number }) => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        this.handleAuthError();
      }
    });

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

    ws.on("close", (code: number) => {
      clearInterval(this.pingTimer);
      this.opts.onClose?.();
      // 1008 (policy violation) and the 44xx range are conventional auth-failure
      // close codes — treat them like a rejected handshake.
      if (code === 1008 || code === 4401 || code === 4403) {
        this.handleAuthError();
      }
      if (this.closedByCaller || this.authFailed) {
        return;
      }
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.opts.reconnectMaxMs);
      this.reconnectTimer = setTimeout(() => void this.connect(), delay);
    });
  }

  /** Stop retrying and notify the host once that auth was rejected. */
  private handleAuthError(): void {
    if (this.authFailed) {
      return;
    }
    this.authFailed = true;
    clearTimeout(this.reconnectTimer);
    this.opts.onAuthError?.();
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

/** http(s)://host -> ws(s)://host (no path) */
export function toWsOrigin(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const proto = trimmed.startsWith("https") ? "wss" : "ws";
  return trimmed.replace(/^https?/, proto);
}

/** http(s)://host -> ws(s)://host/api/ws */
export function toWsUrl(baseUrl: string): string {
  return `${toWsOrigin(baseUrl)}/api/ws`;
}
