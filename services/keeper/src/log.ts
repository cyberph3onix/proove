// Structured JSON-lines logger (one object per line on stdout/stderr).
export type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export function createLogger(level: Level = "info", base: Fields = {}, write: (line: string, level: Level) => void = defaultWrite): Logger {
  const emit = (l: Level, msg: string, fields?: Fields) => {
    if (ORDER[l] < ORDER[level]) return;
    write(JSON.stringify({ ts: new Date().toISOString(), level: l, msg, ...base, ...fields }, replacer), l);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (f) => createLogger(level, { ...base, ...f }, write),
  };
}

function defaultWrite(line: string, level: Level) {
  (level === "warn" || level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

export const silentLogger: Logger = createLogger("error", {}, () => {});
