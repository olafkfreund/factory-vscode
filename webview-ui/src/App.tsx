import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressRing } from "./ProgressRing";
import { Console } from "./Console";
import { vscodeApi, type CockpitState, type ConsoleStatus, type HostToWebview, type WorkItem } from "./protocol";

const STAGES = [
  { label: "Plan", svc: "pfactory" },
  { label: "Code", svc: "aifactory" },
  { label: "Test", svc: "tfactory" },
] as const;

type Category = "running" | "done" | "failed" | "review" | "pending";

function classify(status: string | null | undefined): Category {
  if (!status) return "pending";
  const s = status.toLowerCase();
  if (/(fail|reject|error|block|stuck|cancel)/.test(s)) return "failed";
  if (/review/.test(s)) return "review";
  if (/(done|complete|merged|emitted|triaged|pass|success|verified)/.test(s)) return "done";
  return "running";
}

const COLOR: Record<Category, string> = {
  running: "#fabd2f",
  done: "#b8bb26",
  failed: "#fb4934",
  review: "#fe8019",
  pending: "#665c54",
};

function cats(item: WorkItem): Category[] {
  return [item.pfactory.status, item.aifactory.status, item.tfactory.status].map(classify);
}

function rank(item: WorkItem, flagged: boolean): number {
  const c = cats(item);
  if (flagged || c.includes("failed") || c.includes("review")) return 0;
  if (c.includes("running")) return 1;
  if (c.every((x) => x === "done")) return 3;
  return 2;
}

function numKey(k: string): number {
  const n = Number(k);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  return (
    <span className="ticker">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {prefix}
          {value.toLocaleString()}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function App() {
  const [state, setState] = useState<CockpitState>({ items: [], progress: {}, anomalies: [] });
  const [consoleKey, setConsoleKey] = useState<string | null>(null);
  const [consoleStatus, setConsoleStatus] = useState<ConsoleStatus | null>(null);
  const consoleKeyRef = useRef<string | null>(null);
  const writerRef = useRef<(base64: string) => void>(() => {});

  const registerWriter = useCallback((w: (base64: string) => void) => {
    writerRef.current = w;
  }, []);

  const closeConsole = useCallback(() => {
    vscodeApi().postMessage({ type: "closeConsole" });
    consoleKeyRef.current = null;
    setConsoleKey(null);
    setConsoleStatus(null);
  }, []);

  useEffect(() => {
    const onMessage = (ev: MessageEvent<HostToWebview>) => {
      const msg = ev.data;
      if (!msg) return;
      switch (msg.type) {
        case "state":
          setState(msg.state);
          break;
        case "consoleOpen":
          consoleKeyRef.current = msg.key;
          setConsoleKey(msg.key);
          setConsoleStatus(null);
          break;
        case "console":
          if (msg.key === consoleKeyRef.current) writerRef.current(msg.data);
          break;
        case "consoleStatus":
          if (msg.key === consoleKeyRef.current) setConsoleStatus(msg.status);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    vscodeApi().postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const anomalyKeys = new Set(state.anomalies.map((a) => a.correlation_key));

  const totalTokens = state.items.reduce(
    (sum, it) => sum + (it.pfactory.usage?.total_tokens ?? 0) + (it.aifactory.usage?.total_tokens ?? 0) + (it.tfactory.usage?.total_tokens ?? 0),
    0,
  );
  const totalCost = state.items.reduce(
    (sum, it) => sum + (it.pfactory.usage?.cost_usd ?? 0) + (it.aifactory.usage?.cost_usd ?? 0) + (it.tfactory.usage?.cost_usd ?? 0),
    0,
  );

  const ordered = [...state.items].sort((a, b) => {
    const ra = rank(a, anomalyKeys.has(a.correlation_key));
    const rb = rank(b, anomalyKeys.has(b.correlation_key));
    return ra - rb || numKey(a.correlation_key) - numKey(b.correlation_key);
  });

  return (
    <div className="cockpit">
      <header className="cockpit-header">
        <h1>Factory Cockpit</h1>
        <div className="rollup">
          <span className="stat">{state.items.length} items</span>
          <span className="stat tokens">
            <AnimatedNumber value={totalTokens} /> tok
          </span>
          <span className="stat cost">
            <AnimatedNumber value={Math.round(totalCost * 100) / 100} prefix="$" />
          </span>
          {state.anomalies.length > 0 && <span className="stat anomaly">{state.anomalies.length} anomalies</span>}
        </div>
      </header>

      {state.items.length === 0 && <p className="empty">No work items. The pipeline is idle.</p>}

      <div className="items">
        <AnimatePresence>
          {ordered.map((item) => {
            const flagged = anomalyKeys.has(item.correlation_key);
            const percent = state.progress[item.correlation_key] ?? null;
            const itemCats = cats(item);
            const ringColor =
              COLOR[itemCats.includes("failed") ? "failed" : itemCats.includes("running") ? "running" : itemCats.every((c) => c === "done") ? "done" : "pending"];
            return (
              <motion.div
                key={item.correlation_key}
                className={`item${flagged ? " flagged" : ""}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={
                  flagged
                    ? { opacity: 1, y: 0, boxShadow: ["0 0 0 0 rgba(251,73,52,0)", "0 0 0 3px rgba(251,73,52,0.4)", "0 0 0 0 rgba(251,73,52,0)"] }
                    : { opacity: 1, y: 0 }
                }
                exit={{ opacity: 0, y: -10 }}
                transition={flagged ? { boxShadow: { repeat: Infinity, duration: 1.8 }, layout: { duration: 0.4 } } : { layout: { duration: 0.4 } }}
              >
                <ProgressRing percent={percent} color={ringColor} />
                <div className="item-body">
                  <div className="item-head">
                    <span className="key">#{item.correlation_key}</span>
                    <span className="title">{item.title ?? ""}</span>
                    <div className="actions">
                      <button onClick={() => vscodeApi().postMessage({ type: "openConsole", key: item.correlation_key })}>Console</button>
                      <button onClick={() => vscodeApi().postMessage({ type: "openOnGitHub", key: item.correlation_key })}>GitHub</button>
                    </div>
                  </div>
                  <div className="flow">
                    {STAGES.map((stage, i) => {
                      const svc = item[stage.svc as keyof WorkItem] as WorkItem["pfactory"];
                      const cat = classify(svc.status);
                      const active = cat === "running";
                      return (
                        <div className="flow-step" key={stage.label}>
                          {i > 0 && <span className="connector" />}
                          <motion.div
                            className="stage"
                            style={{ borderColor: COLOR[cat] }}
                            animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                            transition={active ? { repeat: Infinity, duration: 1.6 } : { duration: 0.2 }}
                          >
                            <span className="stage-label">{stage.label}</span>
                            <span className="stage-status" style={{ color: COLOR[cat] }}>
                              {svc.status ?? "-"}
                            </span>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {consoleKey && (
        <Console
          title={`#${consoleKey} agent console`}
          status={consoleStatus}
          registerWriter={registerWriter}
          onClose={closeConsole}
        />
      )}
    </div>
  );
}
