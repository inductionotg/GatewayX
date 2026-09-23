import { bucketKey, consumeTokens } from "./token-bucket.js";

export function requestBuckets(req, config) {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/i, "");
  const userId = req.session?.user?.id;
  const scope = userId ? "user" : "anonymous";
  const buckets = [{
    ...config[scope], scope,
    key: bucketKey(config.prefix, scope, userId ?? ip),
  }];
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (req.method === "POST" && ["/auth/login", "/users"].includes(path)) {
    buckets.push({ ...config.auth, scope: "auth-ip", key: bucketKey(config.prefix, "auth-ip", ip) });
  }
  return buckets;
}

export function createRateLimitMiddleware(client, config) {
  return async function rateLimit(req, res, next) {
    try {
      const result = await consumeTokens(client, requestBuckets(req, config), config.timeoutMs);
      res.set({
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Policy": result.policy,
      });
      if (!result.allowed) {
        res.set("Retry-After", String(result.retryAfter));
        res.set("Cache-Control", "no-store");
        return res.status(429).json({
          error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests; retry later", retryAfter: result.retryAfter },
        });
      }
      next();
    } catch (error) { next(error); }
  };
}
