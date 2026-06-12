import { FactoryHttpError } from "../cfactory/restClient";

export type GetToken = () => Promise<string | undefined> | string | undefined;

interface ClientOptions {
  baseUrl: string;
  getToken: GetToken;
}

/** Minimal typed HTTP client shared by all three factory REST APIs. */
class FactoryClient {
  protected readonly base: string;
  protected readonly getToken: GetToken;

  constructor({ baseUrl, getToken }: ClientOptions) {
    this.base     = baseUrl.replace(/\/+$/, "");
    this.getToken = getToken;
  }

  protected async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  protected async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const token = await this.getToken();
    if (token) { headers.Authorization = `Bearer ${token}`; }
    let resp: Response;
    try {
      resp = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new FactoryHttpError(0, path, `${this.base} unreachable: ${(err as Error).message}`);
    }
    if (!resp.ok) {
      throw new FactoryHttpError(resp.status, path);
    }
    // Some endpoints return 204 No Content
    const text = await resp.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}

// ── PFactory ──────────────────────────────────────────────────────────────────

export interface PlanSession {
  id: string;
  title?: string;
  status: string;       // "pending" | "processing" | "ready" | "approved" | "emitted"
  plan_text?: string;
  issues?: Array<{ title: string; body?: string }>;
  github_issues?: number[];
}

export interface IngestResponse { id: string; }
export interface EmitResponse   { issues_created: number; issue_numbers: number[]; }

export class PFactoryClient extends FactoryClient {
  async ingest(text: string, title?: string): Promise<IngestResponse> {
    return this.post<IngestResponse>("/api/plan/sessions/ingest-text", { text, title });
  }

  async process(id: string): Promise<PlanSession> {
    return this.post<PlanSession>(`/api/plan/sessions/${encodeURIComponent(id)}/process`);
  }

  async getSession(id: string): Promise<PlanSession> {
    return this.get<PlanSession>(`/api/plan/sessions/${encodeURIComponent(id)}`);
  }

  async approve(id: string): Promise<void> {
    await this.post(`/api/plan/sessions/${encodeURIComponent(id)}/approve`);
  }

  async emit(id: string): Promise<EmitResponse> {
    return this.post<EmitResponse>(`/api/plan/sessions/${encodeURIComponent(id)}/emit`);
  }
}

// ── AIFactory / TFactory (identical REST surface) ─────────────────────────────

export interface FactoryProject {
  id: string;
  name: string;
  git_url?: string;
  path?: string;
}

export interface ProjectCreate {
  name: string;
  git_url?: string;
  path?: string;
  branch?: string;
}

export interface ImportResponse {
  tasks: Array<{ id: string; issue_number: number; title?: string }>;
}

export interface Task {
  id: string;
  spec_id?: string;
  title?: string;
  description?: string;
  project_id: string;
  status?: string;
  phase?: string | null;
  subtasks?: Array<{ title: string; status: string }>;
  branch_name?: string | null;
  review_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxMessage {
  messageId: string;
  from: string;
  text: string;
  summary: string;
  timestamp: string;
  read: boolean;
}

export interface TaskCreateDirect {
  title: string;
  description: string;
  project_id: string;
}

export class AgentFactoryClient extends FactoryClient {
  async listProjects(): Promise<FactoryProject[]> {
    const body = await this.get<{ projects?: FactoryProject[] } | FactoryProject[]>("/api/projects");
    return Array.isArray(body) ? body : (body.projects ?? []);
  }

  async createProject(data: ProjectCreate): Promise<FactoryProject> {
    return this.post<FactoryProject>("/api/projects", data);
  }

  async importIssues(projectId: string, issueNumbers: number[]): Promise<ImportResponse> {
    return this.post<ImportResponse>(`/api/projects/${encodeURIComponent(projectId)}/github/import`, { issueNumbers });
  }

  async listTasks(): Promise<Task[]> {
    const body = await this.get<Task[] | { tasks?: Task[] }>("/api/tasks");
    return Array.isArray(body) ? body : (body.tasks ?? []);
  }

  async getTask(taskId: string): Promise<Task> {
    return this.get<Task>(`/api/tasks/${encodeURIComponent(taskId)}`);
  }

  async createTask(data: TaskCreateDirect): Promise<Task> {
    return this.post<Task>("/api/tasks", data);
  }

  async startTask(taskId: string): Promise<void> {
    await this.post(`/api/tasks/${encodeURIComponent(taskId)}/start`);
  }

  async stopTask(taskId: string): Promise<void> {
    await this.post(`/api/tasks/${encodeURIComponent(taskId)}/stop`);
  }

  async approvePlan(taskId: string): Promise<void> {
    await this.post(`/api/tasks/${encodeURIComponent(taskId)}/approve-plan`);
  }

  async rejectPlan(taskId: string, reason?: string): Promise<void> {
    await this.post(`/api/tasks/${encodeURIComponent(taskId)}/reject-plan`, reason ? { reason } : undefined);
  }

  async getInbox(taskId: string): Promise<InboxMessage[]> {
    const body = await this.get<InboxMessage[] | { messages?: InboxMessage[] }>(`/api/tasks/${encodeURIComponent(taskId)}/inbox`);
    return Array.isArray(body) ? body : (body.messages ?? []);
  }

  async postInbox(taskId: string, message: string): Promise<void> {
    await this.post(`/api/tasks/${encodeURIComponent(taskId)}/inbox`, { message });
  }

  async getTaskLogs(taskId: string): Promise<string> {
    const body = await this.get<{ logs?: string } | string>(`/api/tasks/${encodeURIComponent(taskId)}/logs`);
    return typeof body === "string" ? body : (body.logs ?? "");
  }
}
