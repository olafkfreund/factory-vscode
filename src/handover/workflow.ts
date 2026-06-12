import * as vscode from "vscode";
import * as cp from "child_process";
import { AgentFactoryClient, PFactoryClient, type PlanSession, type Task } from "./client";
import { ProjectRegistry } from "./projectRegistry";
import { resolveFactoryUrls } from "./factoryUrls";
import { FactoryHttpError } from "../cfactory/restClient";
import type { Auth } from "../auth";
import { readConfig } from "../config";
import { isActiveStatus } from "../status";

export class HandoverWorkflow {
  private readonly registry: ProjectRegistry;

  constructor(
    private readonly auth: Auth,
    context: vscode.ExtensionContext,
  ) {
    this.registry = new ProjectRegistry(context.globalState);
  }

  // ── Plan ────────────────────────────────────────────────────────────────────

  /**
   * Ingest text into PFactory and return the session for preview. The processing
   * wait is cancellable; `onSession` is called with the session id as soon as it
   * exists so the caller can persist it for resume.
   */
  async startPlanSession(
    text: string,
    title?: string,
    onSession?: (id: string) => void,
  ): Promise<PlanSession> {
    const client = this.makePFactory();
    const { id } = await client.ingest(text, title);
    onSession?.(id);

    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Factory: Processing plan…", cancellable: true },
      async (_progress, token) => {
        // Start processing (non-blocking on server side)
        await client.process(id);
        // Poll every 3 s until ready (max 5 min) or the user cancels.
        const deadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < deadline) {
          if (token.isCancellationRequested) {
            throw new vscode.CancellationError();
          }
          await delay(3000);
          const session = await client.getSession(id);
          if (session.status === "ready" || session.status === "approved") {
            return session;
          }
          if (/fail|error/.test(session.status)) {
            throw new Error(`PFactory session failed (status: ${session.status})`);
          }
        }
        throw new Error("PFactory plan processing timed out after 5 minutes.");
      },
    );
  }

  /** Fetch an existing plan session (for Resume Plan Session). */
  async getPlanSession(sessionId: string): Promise<PlanSession> {
    return this.makePFactory().getSession(sessionId);
  }

  /** Approve and emit an already-ready session. Returns issues created. */
  async approvePlanSession(
    sessionId: string,
    issues?: Array<{ title: string }>,
  ): Promise<{ count: number; numbers: number[] }> {
    const client = this.makePFactory();
    await client.approve(sessionId);
    const result = await client.emit(sessionId, issues);
    return { count: result.issues_created, numbers: result.issue_numbers ?? [] };
  }

  // ── Send to Code / Test ──────────────────────────────────────────────────────

  /**
   * Send an issue to AIFactory/TFactory. Returns whether the agent was actually
   * started ("started") or merely accepted with start unconfirmed ("queued") so
   * the caller can report the real outcome rather than always claiming success.
   */
  async sendToFactory(
    factory: "aifactory" | "tfactory",
    issueNumber: number,
  ): Promise<{ status: "started" | "queued" }> {
    const client   = this.makeAgentFactory(factory);
    const remoteUrl = await this.detectGitRemote();

    if (!remoteUrl) {
      throw new Error("Cannot detect git remote. Open a workspace with a git repository first.");
    }

    let projectId = this.registry.get(remoteUrl, factory);
    if (!projectId) {
      projectId = await this.registerProject(factory, remoteUrl, client);
    }

    let imported;
    try {
      imported = await client.importIssues(projectId, [issueNumber]);
    } catch (err) {
      // Project may have been deleted — invalidate and re-register
      if (err instanceof FactoryHttpError && err.status === 404) {
        this.registry.invalidate(remoteUrl, factory);
        projectId = await this.registerProject(factory, remoteUrl, client);
        imported  = await client.importIssues(projectId, [issueNumber]);
      } else {
        throw err;
      }
    }

    const tasks = imported.tasks ?? [];
    // No task ID returned → the factory manages start internally (queued).
    if (tasks.length === 0) {
      return { status: "queued" };
    }

    // A task ID was returned → we are responsible for starting it. Report
    // "queued" if every start call failed so the user is not misled.
    let anyStarted = false;
    for (const task of tasks) {
      try {
        await client.startTask(task.id);
        anyStarted = true;
      } catch {
        // Start may legitimately 4xx if the factory already auto-started it.
      }
    }
    return { status: anyStarted ? "started" : "queued" };
  }

  // ── Direct task creation ─────────────────────────────────────────────────────

  /**
   * Create a task directly in AIFactory or TFactory without going through PFactory.
   * Returns the created task with its ID.
   */
  async createDirectTask(
    factory: "aifactory" | "tfactory",
    title: string,
    description: string,
  ): Promise<Task> {
    const client = this.makeAgentFactory(factory);
    const remoteUrl = await this.detectGitRemote();

    let projectId: string | undefined;
    if (remoteUrl) {
      projectId = this.registry.get(remoteUrl, factory);
      if (!projectId) {
        projectId = await this.registerProject(factory, remoteUrl, client);
      }
    } else {
      // No git remote — let the user choose an existing project or create one,
      // rather than silently dropping the task into projects[0].
      let projects: Awaited<ReturnType<typeof client.listProjects>> = [];
      try {
        projects = await client.listProjects();
      } catch { /* listing may be unavailable; fall through to create */ }

      const CREATE = "$(add)  Create a new project…";
      const picks: vscode.QuickPickItem[] = [
        ...projects.map((p) => ({ label: p.name, description: p.git_url ?? p.id })),
        { label: CREATE },
      ];
      const chosen = await vscode.window.showQuickPick(picks, {
        title: "Factory: no git remote — choose a project for this task",
      });
      if (!chosen) {
        throw new Error("Cancelled: no project selected.");
      }
      if (chosen.label === CREATE) {
        const name = await vscode.window.showInputBox({
          title: "Factory: new project name",
          value: vscode.workspace.workspaceFolders?.[0]?.name ?? "vscode-workspace",
          validateInput: (v) => v.trim() ? undefined : "Name is required",
        });
        if (!name?.trim()) { throw new Error("Cancelled: project name required."); }
        const proj = await client.createProject({ name: name.trim() });
        projectId = proj.id;
      } else {
        projectId = projects.find((p) => p.name === chosen.label)?.id;
      }
    }

    const task = await client.createTask({ title, description, project_id: projectId! });

    // Start the task
    try {
      await client.startTask(task.id);
    } catch { /* factory may auto-start */ }

    return task;
  }

  // ── Review / Human in the loop ───────────────────────────────────────────────

  /** Return a client for the given factory (used by review panel and command handlers). */
  getFactoryClient(factory: "aifactory" | "tfactory"): AgentFactoryClient {
    return this.makeAgentFactory(factory);
  }

  /** Every registered project (for the Show/Forget Project commands). */
  registryEntries(): Array<{ remoteUrl: string; aifactory?: string; tfactory?: string }> {
    return this.registry.entries();
  }

  /** Forget all factory registrations for a git remote URL. */
  forgetProject(remoteUrl: string): void {
    this.registry.forget(remoteUrl);
  }

  /**
   * Determine which factory service a work item is currently active in and
   * return the corresponding task ID. Returns undefined if no active task.
   */
  resolveActiveTask(
    aifactoryTaskId: string | null | undefined,
    tfactoryTaskId: string | null | undefined,
    aifactoryStatus: string | null | undefined,
    tfactoryStatus: string | null | undefined,
  ): { factory: "aifactory" | "tfactory"; taskId: string } | undefined {
    const isActive = isActiveStatus;

    if (aifactoryTaskId && isActive(aifactoryStatus)) {
      return { factory: "aifactory", taskId: aifactoryTaskId };
    }
    if (tfactoryTaskId && isActive(tfactoryStatus)) {
      return { factory: "tfactory", taskId: tfactoryTaskId };
    }
    // Fall back to whichever has a task ID
    if (aifactoryTaskId) { return { factory: "aifactory", taskId: aifactoryTaskId }; }
    if (tfactoryTaskId)  { return { factory: "tfactory",  taskId: tfactoryTaskId  }; }
    return undefined;
  }

  // ── Onboard project ─────────────────────────────────────────────────────────

  async onboardCurrentWorkspace(): Promise<{ remoteUrl: string; ai: string; tf: string }> {
    let url = await this.detectGitRemote();
    if (!url) {
      const entered = await vscode.window.showInputBox({
        title:  "Factory: Enter git remote URL",
        prompt: "No git remote detected. Paste the HTTPS remote URL for this project.",
        placeHolder: "https://github.com/org/repo.git",
        validateInput: (v) => v.trim() ? undefined : "URL is required",
      });
      if (!entered?.trim()) { throw new Error("Onboard cancelled."); }
      url = normalizeRemoteUrl(entered.trim());
    }

    const urls = this.resolvedUrls();
    const token = () => this.auth.getToken();
    const aiClient = new AgentFactoryClient({ baseUrl: urls.aifactory, getToken: token });
    const tfClient = new AgentFactoryClient({ baseUrl: urls.tfactory,  getToken: token });
    const [aiId, tfId] = await Promise.all([
      this.registerProject("aifactory", url, aiClient),
      this.registerProject("tfactory",  url, tfClient),
    ]);

    return { remoteUrl: url, ai: aiId, tf: tfId };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async registerProject(
    factory: "aifactory" | "tfactory",
    remoteUrl: string,
    client: AgentFactoryClient,
  ): Promise<string> {
    const name = repoName(remoteUrl);

    // Check if it already exists
    try {
      const projects = await client.listProjects();
      const existing = projects.find((p) => p.git_url === remoteUrl || p.name === name);
      if (existing) {
        this.registry.set(remoteUrl, factory, existing.id);
        return existing.id;
      }
    } catch {
      // If list fails we fall through to create
    }

    const project = await client.createProject({ name, git_url: remoteUrl });
    this.registry.set(remoteUrl, factory, project.id);
    return project.id;
  }

  private resolvedUrls() {
    return resolveFactoryUrls(readConfig().cfactoryUrl);
  }

  private makePFactory(): PFactoryClient {
    const urls = this.resolvedUrls();
    return new PFactoryClient({ baseUrl: urls.pfactory, getToken: () => this.auth.getToken() });
  }

  private makeAgentFactory(factory: "aifactory" | "tfactory"): AgentFactoryClient {
    const urls = this.resolvedUrls();
    return new AgentFactoryClient({ baseUrl: urls[factory], getToken: () => this.auth.getToken() });
  }

  private async detectGitRemote(): Promise<string | undefined> {
    // 1. Try the built-in vscode.git extension API
    const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
    if (gitExt) {
      try {
        const api = gitExt.exports.getAPI(1);
        const repos = api.repositories;
        // More than one repo open → let the user choose which to register.
        const repo = repos.length > 1 ? await pickRepository(repos) : repos[0];
        if (repo) {
          const remote = repo.state.remotes.find((r) => r.name === "origin") ?? repo.state.remotes[0];
          const url = remote?.fetchUrl ?? remote?.pushUrl;
          if (url) { return normalizeRemoteUrl(url); }
        }
      } catch {
        // fall through to child_process
      }
    }

    // 2. Fallback: shell out to git. Pick the folder when multi-root.
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) { return undefined; }
    const folder = folders.length > 1
      ? (await vscode.window.showWorkspaceFolderPick({ placeHolder: "Factory: pick the project to register" }))?.uri.fsPath
      : folders[0].uri.fsPath;
    if (!folder) { return undefined; }
    return new Promise((resolve) => {
      cp.exec("git remote get-url origin", { cwd: folder }, (err, stdout) => {
        resolve(err ? undefined : normalizeRemoteUrl(stdout.trim()));
      });
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function repoName(url: string): string {
  return url.replace(/\.git$/, "").split("/").pop() ?? "unknown";
}

/** Normalise SSH remotes to HTTPS and strip trailing .git. */
function normalizeRemoteUrl(url: string): string {
  return url
    .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
    .replace(/\.git$/, "");
}

/** Let the user choose among several open git repositories. */
async function pickRepository(repos: GitRepository[]): Promise<GitRepository | undefined> {
  const picks = repos.map((r) => ({
    label: r.rootUri?.path.split("/").pop() ?? r.rootUri?.path ?? "repository",
    description: r.state.remotes.find((rm) => rm.name === "origin")?.fetchUrl ?? "",
    repo: r,
  }));
  const chosen = await vscode.window.showQuickPick(picks, { title: "Factory: pick the repository to register" });
  return chosen?.repo;
}

// Minimal type shim for the vscode.git extension API
interface GitExtension { getAPI(version: 1): GitAPI; }
interface GitAPI      { repositories: GitRepository[]; }
interface GitRepository {
  rootUri?: { path: string };
  state: { remotes: Array<{ name: string; fetchUrl?: string; pushUrl?: string }> };
}
