import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

export class ApiError extends HTTPException {
  constructor(status: ContentfulStatusCode, message: string) {
    super(status, { message });
  }
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, message);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, message);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, message);
}

export function firstZodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  return `${issue.path.join(".") || "body"}: ${issue.message}`;
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
};
