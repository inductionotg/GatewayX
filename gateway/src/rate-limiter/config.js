export function readRateLimitConfig(env = process.env) {
  function policy(name, defaultCapacity, defaultRate) {
    const capacity = Number(env[`RATE_LIMIT_${name}_CAPACITY`] ?? defaultCapacity);
    const refillPerSecond = Number(env[`RATE_LIMIT_${name}_REFILL_PER_SECOND`] ?? defaultRate);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000 ||
        !Number.isFinite(refillPerSecond) || refillPerSecond < 0.001 || refillPerSecond > 100000 ||
        capacity / refillPerSecond > 7 * 24 * 60 * 60) {
      throw new Error(`Invalid ${name} rate limit: positive capacity/rate and refill horizon <= 7 days required`);
    }
    return { capacity, refillPerSecond };
  }
  const timeoutMs = Number(env.RATE_LIMIT_REDIS_TIMEOUT_MS ?? 2000);
  const prefix = env.RATE_LIMIT_PREFIX ?? "gatewayx:rate:";
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !prefix) {
    throw new Error("Invalid rate limit Redis timeout or prefix");
  }
  return {
    prefix, timeoutMs,
    user: policy("USER", 10, 2),
    anonymous: policy("ANONYMOUS", 20, 1),
    auth: policy("AUTH", 5, 0.1),
  };
}
