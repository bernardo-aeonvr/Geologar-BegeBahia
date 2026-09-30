/** Log estruturado: `[tour] scene:enter { id: "e3-p2", token: 7 }`. */
type Level = "debug" | "info" | "warn" | "error";

const enabled = { debug: false, info: true, warn: true, error: true };

export function setLogLevel(debug: boolean) {
  enabled.debug = debug;
}

export function createLogger(scope: string) {
  const out = (level: Level, event: string, data?: Record<string, unknown>) => {
    if (!enabled[level]) return;
    const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    if (data) fn(`[${scope}] ${event}`, data);
    else fn(`[${scope}] ${event}`);
  };
  return {
    debug: (e: string, d?: Record<string, unknown>) => out("debug", e, d),
    info: (e: string, d?: Record<string, unknown>) => out("info", e, d),
    warn: (e: string, d?: Record<string, unknown>) => out("warn", e, d),
    error: (e: string, d?: Record<string, unknown>) => out("error", e, d),
  };
}

export type Logger = ReturnType<typeof createLogger>;
