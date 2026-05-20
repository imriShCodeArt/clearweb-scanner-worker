import pino from "pino";

import { config } from "../config/env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.nodeEnv === "production" ? "info" : "debug"),
  ...(config.nodeEnv === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
});
