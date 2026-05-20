import { Router } from "express";
import type { Config } from "../config/env.js";
import { createScanRouter } from "./scan.js";
import type { HealthResponse } from "../types/index.js";

const packageVersion = "0.1.0";

export function createRouter(config: Config): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const response: HealthResponse = {
      status: "ok",
      uptime: process.uptime(),
      version: packageVersion,
    };
    res.json(response);
  });

  router.use("/scan", createScanRouter(config));

  return router;
}
