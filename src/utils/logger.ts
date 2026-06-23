const logger = {
  log: (...args: unknown[]): void => {
    if (__DEV__) console.log(...args); // NOSONAR
  },
  warn: (...args: unknown[]): void => {
    if (__DEV__) console.warn(...args); // NOSONAR
  },
  error: (...args: unknown[]): void => {
    if (__DEV__) console.error(...args); // NOSONAR
  },
};

export default logger;
