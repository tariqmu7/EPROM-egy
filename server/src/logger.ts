// Minimal zero-dependency structured logger. Emits one JSON line per event —
// the shape log shippers (Loki / ELK / CloudWatch) parse natively — instead of
// unstructured console.log. `child()` binds context (e.g. a requestId) that
// rides along on every subsequent line, so a request's logs are correlatable.
//
// Level via LOG_LEVEL (debug|info|warn|error, default info). Silent under test.
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;
const SILENT = process.env.NODE_ENV === 'test';

function emit(level: Level, bindings: Record<string, unknown>, msg: string, extra?: Record<string, unknown>): void {
  if (SILENT || LEVELS[level] < MIN) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...bindings, ...extra });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (m, e) => emit('debug', bindings, m, e),
    info: (m, e) => emit('info', bindings, m, e),
    warn: (m, e) => emit('warn', bindings, m, e),
    error: (m, e) => emit('error', bindings, m, e),
    child: (b) => createLogger({ ...bindings, ...b }),
  };
}

export const logger = createLogger({ service: 'eprom-cms-api' });
