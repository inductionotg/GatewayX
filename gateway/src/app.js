import express from "express";
import productRoutes from "./routes/product.routes.js";
import userRoutes from "./routes/user.routes.js";
import { getUserCircuitStates } from "./services/user.service.js";
import { getProductCircuitStates } from "./services/product.service.js";
import { getReviewCircuitStates } from "./services/review.service.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";
import { redis } from "./config/redis.js";
import { readSessionConfig } from "./session/session.config.js";
import { createSessionMiddleware } from "./session/session.middleware.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { readRateLimitConfig } from "./rate-limiter/config.js";
import { createRateLimitMiddleware } from "./rate-limiter/rate-limit.middleware.js";

export function createApp({ redisClient = redis, sessionConfig = readSessionConfig(), verifyCredentials,
  rateLimitConfig = readRateLimitConfig(), rateLimitMiddleware } = {}) {
  const app = express();
  if (sessionConfig.trustedProxyAddresses?.length) {
    app.set("trust proxy", sessionConfig.trustedProxyAddresses);
  } else if (sessionConfig.trustProxyHops > 0) app.set("trust proxy", sessionConfig.trustProxyHops);
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (req, res) => res.json({ status: "ok", service: "gateway" }));
  app.use("/api", createSessionMiddleware(redisClient, sessionConfig));
  app.use("/api", rateLimitMiddleware ?? createRateLimitMiddleware(redisClient, rateLimitConfig));
  app.use("/api/auth", createAuthRoutes(sessionConfig, verifyCredentials));
  app.use("/api/products", productRoutes);
  app.use("/api/users", userRoutes);

  if (process.env.NODE_ENV !== "production") {
    app.get("/debug/circuits", (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ products: getProductCircuitStates(), users: getUserCircuitStates(), reviews: getReviewCircuitStates() });
    });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export default createApp();
