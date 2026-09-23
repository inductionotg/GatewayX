import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/require-auth.js";
import { AuthError } from "../session/session.errors.js";

export function createAuthRoutes(config, verify) {
  const router = Router();
  const controller = createAuthController(config, verify);
  // JSON-only writes and same-origin browser requests; no permissive CORS.
  router.use((req, res, next) => {
    if (req.method !== "POST") return next();
    if (!req.is("application/json")) {
      return next(new AuthError(415, "JSON_REQUIRED", "Send Content-Type: application/json"));
    }
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get("host")}`) {
      return next(new AuthError(403, "ORIGIN_REJECTED", "Cross-origin authentication requests are not allowed"));
    }
    next();
  });
  router.post("/login", controller.login);
  router.get("/me", requireAuth, controller.me);
  router.post("/logout", controller.logout);
  return router;
}
