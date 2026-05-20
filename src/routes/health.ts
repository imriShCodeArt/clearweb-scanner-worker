import { Router } from "express";

import type { Config } from "../config/env.js";
import { getMetricsSnapshot, metricsRegister } from "../lib/metrics.js";
import { getScanner } from "../services/scanner.js";
import { isShuttingDown } from "../services/shutdown.js";
import type { HealthResponse, ReadyResponse } from "../types/index.js";

const packageVersion = "0.1.0";

export function createHealthRouter(config: Config): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const response: HealthResponse = {
      status: "ok",
      uptime: process.uptime(),
      version: packageVersion,
    };
    res.json(response);
  });

  router.get("/health/live", (_req, res) => {
    const response: HealthResponse = {
      status: "ok",
      uptime: process.uptime(),
      version: packageVersion,
    };
    res.json(response);
  });

  router.get("/health/ready", async (_req, res) => {
    if (isShuttingDown()) {
      const response: ReadyResponse = {
        status: "not_ready",
        reason: "shutting_down",
      };
      res.status(503).json(response);
      return;
    }

    try {
      await getScanner(config).verifyReady();
      const response: ReadyResponse = {
        status: "ready",
        chromium: "ok",
      };
      res.json(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Chromium check failed";
      const response: ReadyResponse = {
        status: "not_ready",
        reason: "chromium_unavailable",
        message,
      };
      res.status(503).json(response);
    }
  });

  router.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metricsRegister.contentType);
    res.send(await getMetricsSnapshot());
  });

  return router;
}
