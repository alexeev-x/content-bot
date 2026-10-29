import { boundDetail } from '../error-detail';

export type LogLevel = 'info' | 'warn' | 'error';

// Only these fields exist, so a secret cannot be logged by accident through a free-form payload.
export interface LogEvent {
  component: string;
  operation: string;
  requestId?: string;
  jobId?: string;
  status?: string | number;
  errorCode?: string;
  /** `describeError`'s line: API, step, code, HTTP status and the provider's own words, redacted and bounded. */
  detail?: string;
  durationMs?: number;
  attempt?: number;
  /** Counters only (numbers), so a payload cannot smuggle text into a log line. */
  counts?: Record<string, number>;
  /** Media asset ids (UUIDs, not secrets) the event concerns. */
  mediaIds?: string[];
  cron?: string;
  at?: number;
}

export interface Logger {
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
}

// One JSON object per event, written to console.log as Workers Logs expects.
export function createLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  const emit = (level: LogLevel, event: LogEvent) =>
    write(
      JSON.stringify({
        level,
        ...event,
        ...(event.detail === undefined ? {} : { detail: boundDetail(event.detail, 450) })
      })
    );
  return {
    info: (event) => emit('info', event),
    warn: (event) => emit('warn', event),
    error: (event) => emit('error', event)
  };
}
