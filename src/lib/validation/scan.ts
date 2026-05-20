import { z } from "zod";

export const scanRequestSchema = z.object({
  url: z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z
      .string()
      .trim()
      .min(1, "Missing required field: url")
      .max(2048, "url must be 2048 characters or fewer")
  ),
  options: z
    .object({
      timeout: z
        .number()
        .int()
        .min(1000, "timeout must be at least 1000ms")
        .max(120_000, "timeout must be 120000ms or fewer")
        .optional(),
      includeScreenshot: z.boolean().optional(),
    })
    .optional(),
});

export type ScanRequestInput = z.infer<typeof scanRequestSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}
