import { randomUUID } from "node:crypto";

import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { Config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createRouter } from "./routes/index.js";

export function createApp(config: Config) {
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) {
    app.set("trust proxy", config.trustProxy);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const requestId =
          typeof existing === "string" && existing.length > 0
            ? existing
            : randomUUID();
        res.setHeader("x-request-id", requestId);
        return requestId;
      },
      autoLogging: {
        ignore: (req) =>
          req.url === "/api/health" ||
          req.url === "/api/health/live" ||
          req.url === "/api/health/ready",
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createRouter(config));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found", message: "Route not found" });
  });

  app.use(createErrorHandler());

  return app;
}
