/**
 * Coalesce bursts of calls into at most one invocation per `intervalMs`, always
 * running a trailing call so the final state is never dropped. Used to tame the
 * stream of store "change" events (one per WebSocket progress frame) before they
 * drive an expensive webview post or tree refresh.
 */
export function throttle(fn: () => void, intervalMs: number): { trigger: () => void; cancel: () => void } {
  let last = 0;
  let timer: NodeJS.Timeout | undefined;

  const run = () => {
    last = Date.now();
    timer = undefined;
    fn();
  };

  return {
    trigger() {
      const elapsed = Date.now() - last;
      if (elapsed >= intervalMs) {
        run();
      } else if (!timer) {
        timer = setTimeout(run, intervalMs - elapsed);
      }
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
