import { Router } from "express";
import type { Config } from "../config/env.js";
import { createHealthRouter } from "./health.js";
import { createScanRouter } from "./scan.js";

export function createRouter(config: Config): Router {
  const router = Router();

  router.use(createHealthRouter(config));
  router.use("/scan", createScanRouter(config));

  return router;
}
