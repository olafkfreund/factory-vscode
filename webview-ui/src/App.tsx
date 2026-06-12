import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Console } from "./Console";
import { vscodeApi, type CockpitState, type ConsoleStatus, type HostToWebview, type WorkItem } from "./protocol";

// ── constants ─────────────────────────────────────────────────────────────────
const STAGES = [
  { label: "Plan",  svc: "pfactory"  },
  { label: "Code",  svc: "aifactory" },
  { label: "Test",  svc: "tfactory"  },
] as const;

type Category = "running" | "done" | "failed" | "review" | "pending";
type Filter   = "all" | "running" | "review" | "failed" | "done" | "pending";

const C: Record<Category, string> = {
  running: "#fabd2f",
  done:    "#b8bb26",
  failed:  "#fb4934",
  review:  "#fe8019",
  pending: "#504945",
};

const SECTION_LABELS: Record<number, string> = {
  0: "Needs Attention",
  1: "Running",
  2: "In Progress",
  3: "Done",
};

// ── pure helpers ─────────────────────────────────────────────────────────────
function classify(s: string | null | undefined): Category {
  if (!s) { return "pending"; }
  const l = s.toLowerCase();
  if (/(fail|reject|error|block|stuck|cancel)/.test(l)) { return "failed"; }
  if (/review/.test(l))                                  { return "review"; }
  if (/(done|complete|merged|emitted|triaged|pass|success|verified)/.test(l)) { return "done"; }
  return "running";
}

/** Strip UUID prefix from correlation key, return "#NNN" */
function shortKey(key: string): string {
  const afterColon = key.includes(":") ? key.split(":").pop()! : key;
  const m = afterColon.match(/^(\d+)/);
  return m ? `#${m[1]}` : `#${key.slice(0, 6)}`;
}

/** snake_case or kebab-case → Title Case */
function humanStatus(s: string | null | undefined): string {
  if (!s) { return "—"; }
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemCats(item: WorkItem): Category[] {
  return [item.pfactory.status, item.aifactory.status, item.tfactory.status].map(classify);
}

function rank(item: WorkItem, flagged: boolean): number {
  const c = itemCats(item);
  if (flagged || c.includes("failed") || c.includes("review")) { return 0; }
  if (c.includes("running"))                                    { return 1; }
  if (c.every((x) => x === "done"))                            { return 3; }
  return 2;
}

function matchesFilter(item: WorkItem, filter: Filter, flagged: boolean): boolean {
  if (filter === "all")     { return true; }
  const c = itemCats(item);
  if (filter === "running") { return c.includes("running"); }
  if (filter === "review")  { return c.includes("review") || flagged; }
  if (filter === "failed")  { return c.includes("failed"); }
  if (filter === "done")    { return c.every((x) => x === "done"); }
  if (filter === "pending") { return c.every((x) => x === "pending"); }
  return true;
}

// ── animated robot ─────────────────────────────────────────────────────────────
function RobotIcon({ cat }: { cat: Category }) {
  const fill   = cat === "pending" ? "#504945" : C[cat];
  const isWork = cat === "running";
  const isDone = cat === "done";
  const isFail = cat === "failed";
  const dim    = cat === "pending";

  return (
    <motion.svg width="34" height="34" viewBox="0 0 32 32" fill="none"
      animate={isWork ? { y: [0, -2, 0] } : { y: 0 }}
      transition={isWork ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" } : { duration: 0.3 }}
    >
      <line x1="16" y1="4" x2="16" y2="1" stroke={fill} strokeWidth="1.5" strokeLinecap="round" opacity={dim ? 0.3 : 1} />
      <motion.circle cx="16" cy="1" r="1.5" fill={fill} opacity={dim ? 0.3 : 1}
        animate={isWork ? { r: [1.2, 2.2, 1.2], opacity: [1, 0.4, 1] } : {}}
        transition={isWork ? { repeat: Infinity, duration: 0.55 } : {}}
      />
      <rect x="8" y="4" width="16" height="12" rx="3" fill={fill} opacity={dim ? 0.3 : 1} />
      <rect x="9" y="7" width="14" height="5" rx="1.5" fill="#1d2021" opacity={0.75} />
      {isFail ? (
        <>
          <line x1="12" y1="8.5" x2="14" y2="10.5" stroke={C.failed} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="14" y1="8.5" x2="12" y2="10.5" stroke={C.failed} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="18" y1="8.5" x2="20" y2="10.5" stroke={C.failed} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="20" y1="8.5" x2="18" y2="10.5" stroke={C.failed} strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : isDone ? (
        <>
          <motion.path d="M11 10 L12.5 11.5 L15.5 8" stroke={C.done} strokeWidth="1.6" strokeLinecap="round" fill="none"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }}
          />
          <motion.path d="M17 10 L18.5 11.5 L21.5 8" stroke={C.done} strokeWidth="1.6" strokeLinecap="round" fill="none"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }}
          />
        </>
      ) : (
        <>
          <motion.circle cx="13" cy="9.5" r="2" fill={isWork ? C.running : "#fabd2f55"}
            animate={isWork ? { opacity: [1, 0.2, 1] } : {}}
            transition={isWork ? { repeat: Infinity, duration: 1.0, ease: "easeInOut" } : {}}
          />
          <motion.circle cx="19" cy="9.5" r="2" fill={isWork ? C.running : "#fabd2f55"}
            animate={isWork ? { opacity: [1, 0.2, 1] } : {}}
            transition={isWork ? { repeat: Infinity, duration: 1.0, ease: "easeInOut", delay: 0.18 } : {}}
          />
        </>
      )}
      {isFail
        ? <path d="M11.5 14.5 Q16 12.5 20.5 14.5" stroke="#1d2021" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        : isDone
          ? <path d="M11.5 13.5 Q16 16 20.5 13.5" stroke="#1d2021" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          : <line x1="12" y1="13.5" x2="20" y2="13.5" stroke="#1d2021" strokeWidth="1.3" strokeLinecap="round" />
      }
      <rect x="9" y="17" width="14" height="10" rx="2" fill={fill} opacity={dim ? 0.2 : 0.9} />
      <rect x="11" y="18.5" width="10" height="6" rx="1.5" fill="#1d2021" opacity={0.65} />
      {isWork && (
        <motion.circle cx="16" cy="21.5" r="2.2" fill={C.running}
          animate={{ r: [1.5, 2.8, 1.5], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 0.55 }}
        />
      )}
      {isDone && (
        <motion.path d="M13.5 23 L15 24.5 L18.5 21" stroke={C.done} strokeWidth="1.4" strokeLinecap="round" fill="none"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }}
        />
      )}
      <motion.line x1="9" y1="19" x2="4" y2="23" stroke={fill} strokeWidth="3" strokeLinecap="round"
        opacity={dim ? 0.2 : 0.9}
        animate={isWork ? { rotate: [-18, 28, -18] } : isDone ? { rotate: -35 } : { rotate: 0 }}
        style={{ transformOrigin: "9px 19px" }}
        transition={isWork ? { repeat: Infinity, duration: 0.45 } : { duration: 0.35 }}
      />
      <motion.line x1="23" y1="19" x2="28" y2="23" stroke={fill} strokeWidth="3" strokeLinecap="round"
        opacity={dim ? 0.2 : 0.9}
        animate={isWork ? { rotate: [18, -28, 18] } : isDone ? { rotate: 35 } : { rotate: 0 }}
        style={{ transformOrigin: "23px 19px" }}
        transition={isWork ? { repeat: Infinity, duration: 0.45, delay: 0.22 } : { duration: 0.35 }}
      />
      <rect x="11" y="27" width="4" height="4" rx="1.5" fill={fill} opacity={dim ? 0.2 : 0.7} />
      <rect x="17" y="27" width="4" height="4" rx="1.5" fill={fill} opacity={dim ? 0.2 : 0.7} />
    </motion.svg>
  );
}

// ── animated flow arrow ────────────────────────────────────────────────────────
function FlowArrow({ fromCat, toCat }: { fromCat: Category; toCat: Category }) {
  const transferring = fromCat === "done" && toCat !== "done";
  const active       = fromCat === "done";
  const color = active ? (transferring ? C.running : C.done) : "#3c3836";

  return (
    <div style={{ position: "relative", width: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}>
      <svg width="24" height="10" viewBox="0 0 24 10" fill="none" style={{ overflow: "visible" }}>
        <motion.line x1="2" y1="5" x2="18" y2="5"
          stroke={color} strokeWidth="1.5"
          strokeDasharray={transferring ? "3 2" : "0"}
          animate={transferring ? { strokeDashoffset: [0, -10] } : {}}
          transition={transferring ? { repeat: Infinity, duration: 0.45, ease: "linear" } : {}}
          opacity={active ? 1 : 0.3}
        />
        <path d="M16 2.5 L21 5 L16 7.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : 0.3} />
      </svg>
      {transferring && (
        <motion.div
          style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", background: C.done, boxShadow: `0 0 6px 2px ${C.done}80`, pointerEvents: "none", zIndex: 2 }}
          animate={{ x: [-10, 10], opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 0.65, ease: "easeIn" }}
        />
      )}
    </div>
  );
}

// ── stage chip — full (active/done/failed/review) ─────────────────────────────
function StageChipFull({ label, status, cat, percent }: {
  label: string; status: string | null | undefined; cat: Category; percent?: number | null;
}) {
  const isWork = cat === "running";

  return (
    <motion.div className="chip"
      style={{ "--chip-color": C[cat], position: "relative", overflow: "hidden" } as React.CSSProperties}
      animate={isWork
        ? { boxShadow: [`0 0 0px 0px ${C.running}00`, `0 0 12px 4px ${C.running}55`, `0 0 0px 0px ${C.running}00`] }
        : { boxShadow: "none" }}
      transition={isWork ? { repeat: Infinity, duration: 1.4 } : { duration: 0.35 }}
    >
      {isWork && (
        <motion.div
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${C.running}cc, transparent)`, zIndex: 10, pointerEvents: "none" }}
          animate={{ y: [0, 52, 0] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        />
      )}
      <RobotIcon cat={cat} />
      <div className="chip-text">
        <span className="chip-label">{label}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status ?? "—"} className="chip-status"
            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
          >
            {humanStatus(status)}
          </motion.span>
        </AnimatePresence>
        {isWork && percent != null && (
          <div className="chip-bar">
            <motion.div className="chip-fill"
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              style={{ position: "relative", overflow: "hidden" }}
            >
              <motion.div
                style={{ position: "absolute", top: 0, right: 0, width: 10, height: "100%", background: "rgba(255,255,255,0.5)", borderRadius: 2 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
              />
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── stage chip — compact pending ───────────────────────────────────────────────
function StageChipPending({ label }: { label: string }) {
  return (
    <div className="chip chip-idle">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
        <circle cx="7" cy="7" r="5.5" stroke="#a89984" strokeWidth="1.2" strokeDasharray="2 2" />
      </svg>
      <span className="chip-label chip-label-idle">{label}</span>
    </div>
  );
}

// ── unified stage chip (picks full vs compact automatically) ──────────────────
function StageChip({ label, status, cat, percent }: {
  label: string; status: string | null | undefined; cat: Category; percent?: number | null;
}) {
  if (cat === "pending") {
    return <StageChipPending label={label} />;
  }
  return <StageChipFull label={label} status={status} cat={cat} percent={percent} />;
}

// ── ticker ────────────────────────────────────────────────────────────────────
function Ticker({ value, prefix = "" }: { value: number; prefix?: string }) {
  return (
    <span className="ticker">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value}
          initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -5, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {prefix}{value.toLocaleString()}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ── section divider ───────────────────────────────────────────────────────────
function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="section-divider">
      <span className="section-label">{label}</span>
      <span className="section-count">{count}</span>
    </div>
  );
}

// ── filter pill bar ───────────────────────────────────────────────────────────
function FilterBar({ filter, onChange, counts }: {
  filter: Filter;
  onChange: (f: Filter) => void;
  counts: Partial<Record<Filter, number>>;
}) {
  const pills: { id: Filter; label: string }[] = [
    { id: "all",     label: "All"     },
    { id: "running", label: "Running" },
    { id: "review",  label: "Review"  },
    { id: "failed",  label: "Failed"  },
    { id: "done",    label: "Done"    },
    { id: "pending", label: "Pending" },
  ];
  return (
    <div className="filter-bar">
      {pills.map((p) => {
        const n = counts[p.id] ?? 0;
        if (p.id !== "all" && n === 0) { return null; }
        return (
          <button
            key={p.id}
            className={`filter-pill${filter === p.id ? " active" : ""}`}
            onClick={() => onChange(p.id)}
          >
            {p.label}
            {n > 0 && <span className="filter-count">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── brand robot (header, always animated) ─────────────────────────────────────
function BrandRobot() {
  return (
    <motion.svg width="28" height="28" viewBox="0 0 32 32" fill="none"
      animate={{ rotate: [0, -4, 4, 0] }}
      transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
    >
      <line x1="16" y1="4" x2="16" y2="1" stroke="#fabd2f" strokeWidth="1.5" strokeLinecap="round" />
      <motion.circle cx="16" cy="1" r="1.5" fill="#fabd2f" animate={{ r: [1.2, 2, 1.2] }} transition={{ repeat: Infinity, duration: 1.2 }} />
      <rect x="8" y="4" width="16" height="12" rx="3" fill="#fabd2f" />
      <rect x="9" y="7" width="14" height="5" rx="1.5" fill="#1d2021" opacity={0.75} />
      <motion.circle cx="13" cy="9.5" r="2" fill="#fabd2f" animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 2.5 }} />
      <motion.circle cx="19" cy="9.5" r="2" fill="#fabd2f" animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 2.5, delay: 0.3 }} />
      <line x1="12" y1="13.5" x2="20" y2="13.5" stroke="#1d2021" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="9" y="17" width="14" height="10" rx="2" fill="#fabd2f" opacity={0.9} />
      <rect x="11" y="18.5" width="10" height="6" rx="1.5" fill="#1d2021" opacity={0.65} />
      <motion.circle cx="16" cy="21.5" r="2" fill="#fabd2f" animate={{ opacity: [0.4, 1, 0.4], r: [1.4, 2.4, 1.4] }} transition={{ repeat: Infinity, duration: 0.9 }} />
      <motion.line x1="9" y1="19" x2="4" y2="23" stroke="#fabd2f" strokeWidth="3" strokeLinecap="round"
        animate={{ rotate: [-8, 12, -8] }} style={{ transformOrigin: "9px 19px" }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      />
      <motion.line x1="23" y1="19" x2="28" y2="23" stroke="#fabd2f" strokeWidth="3" strokeLinecap="round"
        animate={{ rotate: [8, -12, 8] }} style={{ transformOrigin: "23px 19px" }}
        transition={{ repeat: Infinity, duration: 1.2, delay: 0.6 }}
      />
      <rect x="11" y="27" width="4" height="4" rx="1.5" fill="#fabd2f" opacity={0.7} />
      <rect x="17" y="27" width="4" height="4" rx="1.5" fill="#fabd2f" opacity={0.7} />
    </motion.svg>
  );
}

// ── item row — memoized to prevent re-render avalanches ───────────────────────
const ItemRow = memo(function ItemRow({ item, percent, flagged, anomalyKind, disableLayout }: {
  item: WorkItem;
  percent: number | null;
  flagged: boolean;
  anomalyKind?: string;
  disableLayout: boolean;
}) {
  const c         = itemCats(item);
  const isAllDone = c.every((x) => x === "done");
  const hasRunning = c.includes("running");
  const hasFailed  = c.includes("failed");
  const hasReview  = c.includes("review");

  const sk    = shortKey(item.correlation_key);
  const title = item.title ?? "";

  return (
    <motion.div
      layout={!disableLayout}
      className={`item${flagged ? " flagged" : ""}${isAllDone ? " all-done" : ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={flagged
        ? { opacity: 1, y: 0, boxShadow: ["0 0 0 0 #fb493400", "0 0 0 3px #fb493466", "0 0 0 0 #fb493400"] }
        : { opacity: 1, y: 0, boxShadow: "none" }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={flagged
        ? { boxShadow: { repeat: Infinity, duration: 1.8 } }
        : { duration: 0.2 }}
    >
      {/* left: key + title */}
      <div className="item-meta">
        <div className="item-key-row">
          <span className={`key-badge ${hasFailed ? "kf" : hasReview ? "kr" : hasRunning ? "ky" : isAllDone ? "kg" : "kn"}`}>
            {sk}
          </span>
          {flagged    && <span className="alert-tag">{anomalyKind ?? "ALERT"}</span>}
          {isAllDone  && !flagged && <span className="done-tag">DONE</span>}
        </div>
        <span className="item-title" title={title}>{title}</span>
      </div>

      {/* centre: pipeline stages */}
      <div className="stages">
        {STAGES.map((stage, i) => {
          const svc     = item[stage.svc as keyof WorkItem] as WorkItem["pfactory"];
          const cat     = classify(svc.status);
          const prevSvc = i > 0 ? item[STAGES[i - 1].svc as keyof WorkItem] as WorkItem["pfactory"] : null;
          const prevCat = prevSvc ? classify(prevSvc.status) : ("pending" as Category);
          return (
            <div className="stage-slot" key={stage.label}>
              {i > 0 && <FlowArrow fromCat={prevCat} toCat={cat} />}
              <StageChip
                label={stage.label}
                status={svc.status}
                cat={cat}
                percent={cat === "running" ? percent : null}
              />
            </div>
          );
        })}
      </div>

      {/* right: action buttons */}
      <div className="actions">
        <button className="btn-icon" title="Open console"
          onClick={() => vscodeApi().postMessage({ type: "openConsole", key: item.correlation_key })}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm1 0v10h10V3H3zm2 2l3 3-3 3 .7.7L9.4 8 5.7 4.3 5 5zm4 5h3v1H9v-1z"/>
          </svg>
        </button>
        <button className="btn-icon" title="Open on GitHub"
          onClick={() => vscodeApi().postMessage({ type: "openOnGitHub", key: item.correlation_key })}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </button>
      </div>
    </motion.div>
  );
});

// ── app ───────────────────────────────────────────────────────────────────────
export function App() {
  const [state, setState]                 = useState<CockpitState>({ items: [], progress: {}, anomalies: [] });
  const [consoleKey, setConsoleKey]       = useState<string | null>(null);
  const [consoleStatus, setConsoleStatus] = useState<ConsoleStatus | null>(null);
  const [filter, setFilter]               = useState<Filter>("all");
  const consoleKeyRef = useRef<string | null>(null);
  const writerRef     = useRef<(b: string) => void>(() => {});

  const registerWriter = useCallback((w: (b: string) => void) => { writerRef.current = w; }, []);
  const closeConsole   = useCallback(() => {
    vscodeApi().postMessage({ type: "closeConsole" });
    consoleKeyRef.current = null;
    setConsoleKey(null);
    setConsoleStatus(null);
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent<HostToWebview>) => {
      const msg = ev.data;
      if (!msg) { return; }
      if (msg.type === "state")              { setState(msg.state); }
      else if (msg.type === "consoleOpen")  { consoleKeyRef.current = msg.key; setConsoleKey(msg.key); setConsoleStatus(null); }
      else if (msg.type === "console" && msg.key === consoleKeyRef.current)       { writerRef.current(msg.data); }
      else if (msg.type === "consoleStatus" && msg.key === consoleKeyRef.current) { setConsoleStatus(msg.status); }
    };
    window.addEventListener("message", onMsg);
    vscodeApi().postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // ── derived state ────────────────────────────────────────────────────────────
  const anomalyMap = new Map(state.anomalies.map((a) => [a.correlation_key, a]));
  const totalTokens = state.items.reduce((s, it) =>
    s + (it.pfactory.usage?.total_tokens ?? 0) + (it.aifactory.usage?.total_tokens ?? 0) + (it.tfactory.usage?.total_tokens ?? 0), 0);
  const totalCost = state.items.reduce((s, it) =>
    s + (it.pfactory.usage?.cost_usd ?? 0) + (it.aifactory.usage?.cost_usd ?? 0) + (it.tfactory.usage?.cost_usd ?? 0), 0);

  const runningCount = state.items.filter((it) => itemCats(it).includes("running")).length;
  const doneCount    = state.items.filter((it) => itemCats(it).every((c) => c === "done")).length;

  // Filter counts for pills
  const filterCounts: Partial<Record<Filter, number>> = {
    all:     state.items.length,
    running: state.items.filter((it) => itemCats(it).includes("running")).length,
    review:  state.items.filter((it) => itemCats(it).includes("review") || anomalyMap.has(it.correlation_key)).length,
    failed:  state.items.filter((it) => itemCats(it).includes("failed")).length,
    done:    doneCount,
    pending: state.items.filter((it) => itemCats(it).every((c) => c === "pending")).length,
  };

  // Sort and filter
  const sorted = [...state.items].sort((a, b) => {
    const ra = rank(a, anomalyMap.has(a.correlation_key));
    const rb = rank(b, anomalyMap.has(b.correlation_key));
    return ra - rb;
  });

  const visible = sorted.filter((it) => matchesFilter(it, filter, anomalyMap.has(it.correlation_key)));

  // Disable layout animation when list is large (prevents cascade re-layout)
  const disableLayout = visible.length > 20;

  // Build sections with dividers
  const sections: Array<{ rankGroup: number; items: WorkItem[] }> = [];
  for (const item of visible) {
    const r = rank(item, anomalyMap.has(item.correlation_key));
    const last = sections[sections.length - 1];
    if (!last || last.rankGroup !== r) {
      sections.push({ rankGroup: r, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <div className="cockpit">
      {/* ── header ── */}
      <header className="cockpit-header">
        <div className="header-brand">
          <BrandRobot />
          <h1>Factory Cockpit</h1>
        </div>
        <div className="rollup">
          {runningCount > 0 && (
            <span className="badge running-badge"><span className="pulse-dot" />{runningCount} running</span>
          )}
          {doneCount > 0 && <span className="badge done-badge">&#10003; {doneCount} done</span>}
          {state.anomalies.length > 0 && <span className="badge anomaly-badge">&#9888; {state.anomalies.length} alerts</span>}
          <span className="stat"><Ticker value={state.items.length} /> items</span>
          <span className="stat tokens"><Ticker value={totalTokens} /> tok</span>
          <span className="stat cost"><Ticker value={Math.round(totalCost * 100) / 100} prefix="$" /></span>
        </div>
      </header>

      {/* ── filter bar ── */}
      {state.items.length > 0 && (
        <FilterBar filter={filter} onChange={setFilter} counts={filterCounts} />
      )}

      {visible.length === 0 && state.items.length > 0 && (
        <p className="empty">No items match this filter.</p>
      )}
      {state.items.length === 0 && (
        <p className="empty">Pipeline idle — no work items.</p>
      )}

      {/* ── item list with section dividers ── */}
      <div className="items">
        <AnimatePresence initial={false}>
          {sections.map(({ rankGroup, items }) => (
            <React.Fragment key={rankGroup}>
              {filter === "all" && (
                <SectionDivider
                  label={SECTION_LABELS[rankGroup] ?? "Other"}
                  count={items.length}
                />
              )}
              {items.map((item) => (
                <ItemRow
                  key={item.correlation_key}
                  item={item}
                  percent={state.progress[item.correlation_key] ?? null}
                  flagged={anomalyMap.has(item.correlation_key)}
                  anomalyKind={anomalyMap.get(item.correlation_key)?.kind}
                  disableLayout={disableLayout}
                />
              ))}
            </React.Fragment>
          ))}
        </AnimatePresence>
      </div>

      {consoleKey && (
        <Console
          title={`${shortKey(consoleKey)} agent console`}
          status={consoleStatus}
          registerWriter={registerWriter}
          onClose={closeConsole}
        />
      )}
    </div>
  );
}
