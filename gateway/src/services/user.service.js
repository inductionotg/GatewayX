import { createServiceClient } from "../downstream/service-client.js";

const client = createServiceClient({
  service: "user",
  instances: (process.env.USER_SERVICE_URLS ?? "http://127.0.0.1:3105")
    .split(",").map((url) => url.trim()).filter(Boolean),
  failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 3),
  resetTimeoutMs: Number(process.env.CIRCUIT_RESET_TIMEOUT_MS ?? 10000),
  timeoutMs: Number(process.env.DOWNSTREAM_TIMEOUT_MS ?? 2000),
});

export function registerUser(body) {
  return client.request("/users", { method: "POST", body });
}

export function verifyCredentials(body) {
  return client.request("/auth/verify", { method: "POST", body });
}

export function getUserCircuitStates() {
  return client.snapshot();
}
