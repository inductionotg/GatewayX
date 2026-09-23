import { ServiceUnavailableError } from "../downstream/service-client.js";
import { AuthError } from "../session/session.errors.js";
import { RateLimitStoreError } from "../rate-limiter/token-bucket.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.type === "entity.too.large" ? 413 : 400).json({
      error: { code: "INVALID_BODY", message: "Provide a valid JSON body no larger than 16 KB" },
    });
  }

  if (error instanceof AuthError || error instanceof RateLimitStoreError) {
    res.set("Cache-Control", "no-store");
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }

  console.error(error);

  if (error instanceof ServiceUnavailableError) {
    return res.status(503).json({
      error: { code: error.code, message: error.message },
    });
  }

  const timedOut = error.name === "TimeoutError";

  res.status(timedOut ? 504 : 502).json({
    error: {
      code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
      message: timedOut
        ? "The downstream service took too long to respond"
        : "Could not retrieve a valid response from the downstream service",
    },
  });
}
