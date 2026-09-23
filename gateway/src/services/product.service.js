import { createServiceClient } from "../downstream/service-client.js";

const instances = (process.env.PRODUCT_SERVICE_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const client = createServiceClient({
  service: "product",
  instances,
  failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 3),
  resetTimeoutMs: Number(process.env.CIRCUIT_RESET_TIMEOUT_MS ?? 10000),
  timeoutMs: Number(process.env.DOWNSTREAM_TIMEOUT_MS ?? 2000),
});

export async function getProducts() {
  return client.request("/products");
}

export async function getProductById(id) {
  return client.request(`/products/${encodeURIComponent(id)}`);
}

export function getProductCircuitStates() {
  return client.snapshot();
}
