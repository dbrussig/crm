/* Minimal structured logger used across services/components. */
type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => console.debug('[DEBUG]', ...args),
  info: (...args: LogArgs) => console.info('[INFO]', ...args),
  warn: (...args: LogArgs) => console.warn('[WARN]', ...args),
  error: (...args: LogArgs) => console.error('[ERROR]', ...args),
};

