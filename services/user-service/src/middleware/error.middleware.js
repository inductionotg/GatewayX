import { HttpError } from "../utils/http-error.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.type === "entity.too.large" ? 413 : 400).json({
      error: { code: "INVALID_BODY", message: "Provide a valid JSON body no larger than 16 KB" },
    });
  }
  // Do not log raw Prisma errors: query diagnostics can contain submitted data.
  console.error("User Service operation failed", { name: error.name, code: error.code });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}
