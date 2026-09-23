import session from "express-session";
import { RedisStore } from "connect-redis";
import { AuthError, SessionStorageError, redisOperation } from "./session.errors.js";

export function createSessionMiddleware(client, config) {
  // Bound store operations even if Redis accepts a TCP connection but stops responding.
  const boundedClient = Object.fromEntries(["get", "set", "del", "expire"].map((method) => [
    method, (...args) => redisOperation(() => client[method](...args), config.timeoutMs),
  ]));
  const store = new RedisStore({
    client: boundedClient,
    prefix: config.prefix,
    ttl: config.ttlSeconds,
    // Refresh explicitly before sending a response so failures can return 503.
    disableTouch: true,
  });
  const middleware = session({
    store,
    secret: config.secret,
    name: config.name,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...config.cookie, maxAge: config.ttlSeconds * 1000 },
  });

  return function loadSession(req, res, next) {
    const hasCookie = (req.headers.cookie ?? "").split(";")
      .some((cookie) => cookie.trim().startsWith(`${config.name}=`));
    const isAuthRoute = req.path === "/auth" || req.path.startsWith("/auth/");
    // Public anonymous reads/registration do not need a Redis session.
    if (!hasCookie && !isAuthRoute) return next();
    res.set("Cache-Control", "no-store");
    if (!client.isReady) return next(new SessionStorageError());

    middleware(req, res, (error) => {
      if (error) {
        req.session = null;
        return next(new SessionStorageError());
      }
      if (!req.session?.user) return next();
      boundedClient.expire(config.prefix + req.sessionID, config.ttlSeconds)
        .then((exists) => {
          // EXPIRE never recreates a key deleted by a concurrent logout.
          if (!exists) {
            req.session = null;
            res.clearCookie(config.name, config.cookie);
            return next(new AuthError(401, "SESSION_EXPIRED", "Please log in again"));
          }
          next();
        })
        .catch(() => {
          req.session = null;
          next(new SessionStorageError());
        });
    });
  };
}
