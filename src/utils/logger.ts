import RNFS from 'react-native-fs';
import { useDebugLogsStore } from '../stores/debugLogsStore';

// Persistent on-disk log for export while testing. Rotated so a long session
// doesn't grow unbounded (~250 bytes/line -> 20 MB buys ~80k lines).
const LOG_FILE_NAME = 'download-debug.log';
const MAX_LOG_FILE_BYTES = 20 * 1024 * 1024;
const RETAINED_LOG_LINES = 50000;

let writeQueue: Promise<void> = Promise.resolve();

function getLogFilePath(): string {
  return `${RNFS.DocumentDirectoryPath}/${LOG_FILE_NAME}`;
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  }
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || arg == null) return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function appendPersistentLog(level: 'log' | 'warn' | 'error', message: string): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}\n`;
  writeQueue = writeQueue.then(async () => {
    try {
      const path = getLogFilePath();
      if (await RNFS.exists(path)) {
        await RNFS.appendFile(path, line, 'utf8');
      } else {
        await RNFS.writeFile(path, line, 'utf8');
      }
      const stat = await RNFS.stat(path);
      const size = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : stat.size;
      if (size > MAX_LOG_FILE_BYTES) {
        const content = await RNFS.readFile(path, 'utf8');
        const trimmed = content.split('\n').filter(Boolean).slice(-RETAINED_LOG_LINES).join('\n');
        await RNFS.writeFile(path, trimmed ? `${trimmed}\n` : '', 'utf8');
      }
    } catch {
      // Logging must never break app execution.
    }
  });
}

function capture(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  const message = args.map(formatArg).join(' ');
  try {
    useDebugLogsStore.getState().addLog({ timestamp: Date.now(), level, message });
  } catch {
    // Ignore store failures during logger bootstrap.
  }
  appendPersistentLog(level, message);
}

const logger = {
  log: (...args: unknown[]): void => {
    capture('log', args);
    if (__DEV__) console.log(...args); // NOSONAR
  },
  warn: (...args: unknown[]): void => {
    capture('warn', args);
    if (__DEV__) console.warn(...args); // NOSONAR
  },
  error: (...args: unknown[]): void => {
    capture('error', args);
    if (__DEV__) console.error(...args); // NOSONAR
  },
  getLogFilePath,
};

export default logger;
