import { verifyCredentials } from "../services/user.service.js";
import { AuthError, SessionStorageError } from "../session/session.errors.js";

function sessionAction(req, method) {
  return new Promise((resolve, reject) => {
    req.session[method]((error) => {
      if (error) {
        // Never let express-session auto-save or issue a cookie after a failed operation.
        req.session = null;
        reject(new SessionStorageError());
      } else resolve();
    });
  });
}

export function createAuthController(config, verify = verifyCredentials) {
  return {
    async login(req, res, next) {
      try {
        const { email, password } = req.body ?? {};
        if (typeof email !== "string" || email.trim().length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
            typeof password !== "string" || password.length < 8 ||
            Buffer.byteLength(password, "utf8") > 128) {
          throw new AuthError(400, "INVALID_CREDENTIALS_INPUT", "Provide a valid email and password");
        }
        const result = await verify({ email: email.trim().toLowerCase(), password });
        if (result.status === 401) {
          throw new AuthError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
        }
        const user = result.data?.data;
        if (result.status !== 200 || typeof user?.id !== "string" ||
            typeof user?.name !== "string" || typeof user?.email !== "string") {
          throw new AuthError(503, "AUTH_SERVICE_UNAVAILABLE", "Login is temporarily unavailable");
        }
        await sessionAction(req, "regenerate");
        req.session.user = { id: user.id, name: user.name, email: user.email };
        await sessionAction(req, "save");
        res.json({ data: req.session.user });
      } catch (error) { next(error); }
    },
    me(req, res) {
      res.json({ data: req.session.user });
    },
    async logout(req, res, next) {
      try {
        await sessionAction(req, "destroy");
        res.clearCookie(config.name, config.cookie);
        res.status(204).end();
      } catch (error) { next(error); }
    },
  };
}
