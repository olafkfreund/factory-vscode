import type {
  ActivityEntry,
  Anomaly,
  Health,
  LiveAgentsResponse,
  LiveProgress,
  ProcessDetail,
  Rollups,
  WorkItem,
} from "./types";

/** Error thrown for non-2xx CFactory responses. Carries the HTTP status. */
export class FactoryHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    message?: string,
  ) {
    super(message ?? `CFactory ${endpoint} returned HTTP ${status}`);
    this.name = "FactoryHttpError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface RestClientOptions {
  /** Base URL of the CFactory backend, e.g. http://localhost:3111 (no trailing slash). */
  baseUrl: string;
  /** Returns the current bearer token, or undefined when none is set. */
  getToken: () => Promise<string | undefined> | string | undefined;
  /** Optional fetch override (used in tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Typed, dependency-free client over the CFactory REST surface. Holds no
 * VS Code state, so it is unit-testable in plain Node. Auth and configuration
 * are injected via options.
 */
export class RestClient {
  private readonly baseUrl: string;
  private readonly getToken: RestClientOptions["getToken"];
  private readonly fetchImpl: typeof fetch;

  constructor(options: RestClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getToken = options.getToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // --- Endpoints ---

  health(): Promise<Health> {
    return this.get<Health>("/health");
  }

  async workItems(): Promise<WorkItem[]> {
    const body = await this.get<{ count: number; items: WorkItem[] }>("/api/workitems");
    return body.items ?? [];
  }

  workItem(correlationKey: string): Promise<WorkItem> {
    return this.get<WorkItem>(`/api/workitems/${encodeURIComponent(correlationKey)}`);
  }

  process(correlationKey: string): Promise<ProcessDetail> {
    return this.get<ProcessDetail>(`/api/workitems/${encodeURIComponent(correlationKey)}/process`);
  }

  async progress(): Promise<LiveProgress[]> {
    const body = await this.get<{ items: LiveProgress[] }>("/api/progress");
    return body.items ?? [];
  }

  async anomalies(): Promise<Anomaly[]> {
    const body = await this.get<{ anomalies: Anomaly[] }>("/api/anomalies");
    return body.anomalies ?? [];
  }

  rollups(): Promise<Rollups> {
    return this.get<Rollups>("/api/rollups");
  }

  liveAgents(): Promise<LiveAgentsResponse> {
    return this.get<LiveAgentsResponse>("/api/live-agents");
  }

  async activity(limit = 50): Promise<ActivityEntry[]> {
    const body = await this.get<{ activity: ActivityEntry[] }>(`/api/activity?limit=${limit}`);
    return body.activity ?? [];
  }

  // --- Internals ---

  private async get<T>(endpoint: string): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.baseUrl}${endpoint}`, { headers });
    } catch (err) {
      throw new FactoryHttpError(0, endpoint, `CFactory unreachable: ${(err as Error).message}`);
    }
    if (!resp.ok) {
      throw new FactoryHttpError(resp.status, endpoint);
    }
    return (await resp.json()) as T;
  }
}
