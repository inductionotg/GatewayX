import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const script = readFileSync(new URL("./token-bucket.lua", import.meta.url), "utf8");

export class RateLimitStoreError extends Error {
  constructor() {
    super("Rate limiting is temporarily unavailable");
    this.status = 503;
    this.code = "RATE_LIMIT_STORE_UNAVAILABLE";
  }
}

export function bucketKey(prefix, scope, identity) {
  const digest = createHash("sha256").update(String(identity)).digest("hex");
  return `${prefix}${scope}:${digest}`;
}

export async function consumeTokens(client, buckets, timeoutMs = 2000) {
  if (!client.isReady) throw new RateLimitStoreError();
  let timer;
  try {
    const result = await Promise.race([
      client.eval(script, {
        keys: buckets.map((bucket) => bucket.key),
        arguments: buckets.flatMap(({ capacity, refillPerSecond }) => [String(capacity), String(refillPerSecond)]),
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new RateLimitStoreError()), timeoutMs);
      }),
    ]);
    return {
      allowed: result[0] === 1,
      limit: result[1],
      remaining: result[2],
      retryAfter: result[0] === 1 ? 0 : Math.max(1, Math.ceil(result[3] / 1000)),
      policy: buckets[result[4] - 1].scope,
    };
  } catch {
    throw new RateLimitStoreError();
  } finally { clearTimeout(timer); }
}
