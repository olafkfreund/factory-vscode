import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { ConsoleStatus } from "./protocol";

interface Props {
  title: string;
  status: ConsoleStatus | null;
  /** Register the byte sink the host feeds; called with each base64 frame. */
  registerWriter: (write: (base64: string) => void) => void;
  onClose: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/** Embedded read-only agent console backed by xterm.js. */
export function Console({ title, status, registerWriter, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      fontSize: 12,
      disableStdin: true,
      convertEol: false,
      scrollback: 5000,
      theme: { background: "#1d2021", foreground: "#ebdbb2", cursor: "#1d2021" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (hostRef.current) {
      term.open(hostRef.current);
      fit.fit();
    }
    registerWriter((b64) => term.write(base64ToBytes(b64)));

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* terminal not ready */
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      registerWriter(() => {});
      term.dispose();
    };
  }, [registerWriter]);

  return (
    <div className="console">
      <div className="console-head">
        <span className="console-title">{title}</span>
        <span className="console-status">{status ?? "connecting"}</span>
        <button onClick={onClose}>Close</button>
      </div>
      <div ref={hostRef} className="console-term" />
    </div>
  );
}
