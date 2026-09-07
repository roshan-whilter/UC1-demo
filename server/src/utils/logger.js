import { config } from "../config/env.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const emit = (level, args) => {
  if (LEVELS[level] > (LEVELS[config.logLevel] ?? LEVELS.info)) return;
  const stamp = new Date().toISOString();
  const sink = level === "error" ? console.error : console.log;
  sink(`${stamp} ${level.toUpperCase()}`, ...args);
};

export const logger = {
  error: (...args) => emit("error", args),
  warn: (...args) => emit("warn", args),
  info: (...args) => emit("info", args),
  debug: (...args) => emit("debug", args),
};
