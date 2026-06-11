// CFactory API types, ported from CFactory `apps/frontend-web/src/api.ts`.
// Keep these in sync with the backend RFC-0001 models. The plugin is a
// consumer of CFactory, so these shapes are the contract.

export interface Health {
  status: string;
  service: string;
  version: string;
  multi_tenant?: boolean;
  upstreams: Record<string, string>;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  model?: string | null;
}

/** Per-service slice of a work item (pfactory / aifactory / tfactory). */
export interface ServiceState {
  task_id: string | null;
  status: string | null;
  phase: string | null;
  usage?: TokenUsage | null;
}

export interface TimelineEvent {
  service: string;
  status: string | null;
  phase: string | null;
  updated_at: string;
}

/** One unit of work threaded across the three factories by correlation key. */
export interface WorkItem {
  correlation_key: string;
  title: string | null;
  pfactory: ServiceState;
  aifactory: ServiceState;
  tfactory: ServiceState;
  timeline: TimelineEvent[];
}

export interface LiveProgress {
  correlation_key: string;
  service: string;
  phase: string | null;
  percent: number | null;
  subtask?: string | null;
  updated_at: string;
}

/** Live feed frames pushed over /api/ws (used by the LiveSocket in issue #4). */
export type FeedMessage =
  | { type: "workitem"; item: WorkItem }
  | { type: "snapshot"; items: WorkItem[] }
  | { type: "progress"; item: LiveProgress };

export interface ProcessSubtask {
  title: string | null;
  status: string | null;
}

/** Rich live state for one work item's active task (/api/workitems/{key}/process). */
export interface ProcessDetail {
  available: boolean;
  correlation_key: string;
  service?: string;
  task_id?: string | null;
  title?: string | null;
  status?: string | null;
  phase?: string | null;
  reason?: string;
  progress?: {
    phase: string | null;
    phase_percent: number | null;
    overall_percent: number | null;
    current_subtask: string | null;
    message: string | null;
  };
  subtasks?: ProcessSubtask[];
  branch?: string | null;
  updated_at?: string | null;
}

export interface Anomaly {
  kind: string; // "failure" | "handback_loop" | "stuck"
  severity: string; // "high" | "medium"
  correlation_key: string;
  title: string | null;
  detail: string;
}

export interface Rollups {
  total_work_items: number;
  by_stage: { plan: number; code: number; test: number };
  total_events: number;
  latency: { avg_seconds: number; max_seconds: number } | null;
}

export interface ActivityEntry {
  service: string;
  correlation_key: string;
  status: string;
  phase?: string | null;
  updated_at: string;
  title?: string | null;
}

/** AIFactory/TFactory rmux console, proxied token-safe by CFactory. */
export interface LiveAgent {
  correlation_key: string;
  spec_id: string;
  service: string;
  title: string | null;
  phase: string | null;
  status: string | null;
  ws_path: string;
}

export interface LiveAgentsResponse {
  rmux_enabled: boolean;
  count: number;
  agents: LiveAgent[];
}
