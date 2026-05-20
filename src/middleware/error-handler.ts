import type { NextFunction, Request, Response } from "express";

import { mapErrorToResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function createErrorHandler() {
  return (
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    logger.error({ err }, "Unhandled request error");
    const mapped = mapErrorToResponse(err);
    res.status(mapped.status).json(mapped.body);
  };
}
