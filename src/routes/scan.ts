import rateLimit from "express-rate-limit";
import { Router } from "express";

import type { Config } from "../config/env.js";
import { mapErrorToResponse } from "../lib/errors.js";
import { createApiKeyAuth } from "../middleware/auth.js";
import { getJobQueue } from "../services/job-queue.js";
import { isShuttingDown } from "../services/shutdown.js";
import { getJobStore } from "../services/job-store.js";
import { ScanUrlError, parseAndValidateUrl } from "../lib/scanner/url.js";
import type {
  ErrorResponse,
  ScanJobCreatedResponse,
  ScanJobResponse,
  ScanRequest,
} from "../types/index.js";

function toJobResponse(job: NonNullable<ReturnType<ReturnType<typeof getJobStore>["get"]>>): ScanJobResponse {
  return {
    jobId: job.jobId,
    status: job.status,
    url: job.url,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.progress ? { progress: job.progress } : {}),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

export function createScanRouter(config: Config): Router {
  const router = Router();

  router.use(createApiKeyAuth(config.apiKey));
  router.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        const error: ErrorResponse = {
          error: "Too Many Requests",
          message: "Rate limit exceeded",
        };
        res.status(429).json(error);
      },
    }),
  );

  router.post("/", (req, res) => {
    if (isShuttingDown()) {
      const error: ErrorResponse = {
        error: "Service Unavailable",
        message: "Server is shutting down",
      };
      res.status(503).json(error);
      return;
    }

    const body = req.body as Partial<ScanRequest>;

    if (!body.url || typeof body.url !== "string") {
      const error: ErrorResponse = {
        error: "Bad Request",
        message: "Missing required field: url",
      };
      res.status(400).json(error);
      return;
    }

    try {
      parseAndValidateUrl(body.url);
    } catch (err) {
      if (err instanceof ScanUrlError) {
        const mapped = mapErrorToResponse(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const jobQueue = getJobQueue(config);
    const jobId = jobQueue.enqueue({
      url: body.url,
      options: body.options,
    });

    const response: ScanJobCreatedResponse = {
      jobId,
      status: "queued",
      url: body.url,
    };

    res.status(202).json(response);
  });

  router.get("/:jobId", (req, res) => {
    const jobId = req.params.jobId;
    if (!jobId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing job ID",
      });
      return;
    }

    const job = getJobStore(config.jobRetentionMs).get(jobId);

    if (!job) {
      const error: ErrorResponse = {
        error: "Not Found",
        message: "Scan job not found",
      };
      res.status(404).json(error);
      return;
    }

    res.json(toJobResponse(job));
  });

  return router;
}
