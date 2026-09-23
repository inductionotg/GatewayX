import { isIP } from "node:net";

export function readSessionConfig(env = process.env) {
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes; use the same random secret on both gateways");
  }
  const ttlSeconds = Number(env.SESSION_TTL_SECONDS ?? 1800);
  const timeoutMs = Number(env.SESSION_REDIS_TIMEOUT_MS ?? 2000);
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  const trustedProxyAddresses = (env.TRUST_PROXY_ADDRESSES ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (trustedProxyAddresses.some(address => !isIP(address))) {
    throw new Error("TRUST_PROXY_ADDRESSES must contain comma-separated IP addresses");
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 ||
      !Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error("Invalid session duration, timeout, or proxy configuration");
  }
  const name = env.SESSION_COOKIE_NAME ?? "gatewayx.sid";
  if (!/^[\w.-]+$/.test(name)) throw new Error("Invalid session cookie name");
  return {
    secret: env.SESSION_SECRET,
    name,
    prefix: env.SESSION_REDIS_PREFIX ?? "gatewayx:sessions:",
    ttlSeconds,
    timeoutMs,
    trustProxyHops,
    trustedProxyAddresses,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production" || env.SESSION_COOKIE_SECURE === "true",
      path: "/",
    },
  };
}
