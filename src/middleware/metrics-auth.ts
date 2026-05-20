import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function extractBearerToken(req: Request): string | undefined {
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

export function createOptionalApiKeyAuth(expectedApiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expectedApiKey) {
      next();
      return;
    }

    const provided = extractBearerToken(req);
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
