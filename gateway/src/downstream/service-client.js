import { CircuitBreaker } from "../circuit-breaker/circuit-breaker.js";
import { createRoundRobin } from "../load-balancer/round-robin.js";

export class ServiceUnavailableError extends Error {
  constructor(service) {
    super(`No ${service} instance is currently accepting calls`);
    this.name = "ServiceUnavailableError";
    this.code = "SERVICE_UNAVAILABLE";
    this.status = 503;
  }
}

export function createServiceClient({ service, instances,
  failureThreshold = 3, resetTimeoutMs = 10000, timeoutMs = 2000,
  fetchImpl = fetch, now = () => performance.now(), logger = console }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Downstream timeout must be a positive integer");
  }
  const addresses = [...new Set(instances.map((instance) => {
    const url = new URL(instance);
    if (!["http:", "https:"].includes(url.protocol) ||
        url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash) {
      throw new Error("Service instances must be HTTP(S) origins without credentials");
    }
    return url.origin;
  }))];

  const pool = addresses.map((instance) => ({
    instance,
    breaker: new CircuitBreaker({
      name: instance, failureThreshold, resetTimeoutMs, now,
      onTransition: ({ from, to }) =>
        logger.log(`[circuit] ${service} ${instance}: ${from} -> ${to}`),
    }),
  }));
  const selectNext = createRoundRobin(pool);

  async function request(path, { method = "GET", body, validateResponse } = {}) {
    let selected;
    let permit;
    // Scan each instance at most once; never wait for an open circuit.
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = selectNext();
      const permission = candidate.breaker.tryAcquire();
      if (permission) {
        selected = candidate;
        permit = permission;
        break;
      }
    }
    if (!permit) throw new ServiceUnavailableError(service);

    const startedAt = now();
    let status;
    try {
      const url = new URL(path, selected.instance);
      logger.log(`[${service}] Calling ${url}`);
      const response = await fetchImpl(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      const data = await response.json();
      // Invalid successful payloads are dependency failures, not recovery signals.
      if (status >= 200 && status < 300 && validateResponse) validateResponse(data);
      if (status >= 500) permit.failure();
      else permit.success();
      logger.log(`[${service}] ${selected.instance} returned ${status} ` +
        `in ${Math.round(now() - startedAt)}ms`);
      return { status, data };
    } catch (error) {
      // A normal client error is not evidence of a broken instance,
      // even if its error body is not JSON.
      if (status >= 400 && status < 500) permit.success();
      else permit.failure();
      logger.error(`[${service}] ${selected.instance} failed after ` +
        `${Math.round(now() - startedAt)}ms: ${error.message}`);
      throw error;
    }
  }

  return { request, snapshot: () => pool.map(({ breaker }) => breaker.snapshot()) };
}
