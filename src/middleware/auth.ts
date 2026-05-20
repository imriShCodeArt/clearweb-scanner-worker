import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function extractApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const header = req.headers["x-api-key"];
  if (typeof header === "string") {
    return header.trim();
  }

  return undefined;
}

function keysMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createApiKeyAuth(expectedApiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = extractApiKey(req);

    if (!provided || !keysMatch(provided, expectedApiKey)) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or missing API key",
      });
      return;
    }

    next();
  };
}
