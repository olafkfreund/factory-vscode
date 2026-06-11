import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vscodeApi, type CockpitState, type HostToWebview, type WorkItem } from "./protocol";

const STAGES = [
  { label: "Plan", svc: "pfactory" },
  { label: "Code", svc: "aifactory" },
  { label: "Test", svc: "tfactory" },
] as const;

type Category = "running" | "done" | "failed" | "review" | "pending";

function classify(status: string | null): Category {
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

export function App() {
  const [state, setState] = useState<CockpitState>({ items: [], progress: {}, anomalies: [] });

  useEffect(() => {
    const onMessage = (ev: MessageEvent<HostToWebview>) => {
      if (ev.data?.type === "state") {
        setState(ev.data.state);
      }
    };
    window.addEventListener("message", onMessage);
    vscodeApi().postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="cockpit">
      <header className="cockpit-header">
        <h1>Factory Cockpit</h1>
        <div className="rollup">
          <span>{state.items.length} work items</span>
          {state.anomalies.length > 0 && <span className="anomaly">{state.anomalies.length} anomalies</span>}
        </div>
      </header>

      {state.items.length === 0 && <p className="empty">No work items. The pipeline is idle.</p>}

      <div className="items">
        <AnimatePresence>
          {state.items.map((item) => (
            <motion.div
              key={item.correlation_key}
              className="item"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="item-head">
                <span className="key">#{item.correlation_key}</span>
                <span className="title">{item.title ?? ""}</span>
                {state.progress[item.correlation_key] != null && (
                  <span className="pct">{Math.round(state.progress[item.correlation_key] as number)}%</span>
                )}
                <div className="actions">
                  <button onClick={() => vscodeApi().postMessage({ type: "openConsole", key: item.correlation_key })}>
                    Console
                  </button>
                  <button onClick={() => vscodeApi().postMessage({ type: "openOnGitHub", key: item.correlation_key })}>
                    GitHub
                  </button>
                </div>
              </div>
              <div className="stages">
                {STAGES.map((stage) => {
                  const svc = item[stage.svc as keyof WorkItem] as WorkItem["pfactory"];
                  const cat = classify(svc.status);
                  return (
                    <div key={stage.label} className="stage" style={{ borderColor: COLOR[cat] }}>
                      <span className="stage-label">{stage.label}</span>
                      <span className="stage-status" style={{ color: COLOR[cat] }}>
                        {svc.status ?? "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
