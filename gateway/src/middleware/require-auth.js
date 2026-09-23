import { AuthError } from "../session/session.errors.js";

export function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return next(new AuthError(401, "AUTH_REQUIRED", "Please log in"));
  }
  next();
}
