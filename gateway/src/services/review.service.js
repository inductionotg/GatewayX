import { createServiceClient } from "../downstream/service-client.js";

const reviewServiceUrl = process.env.REVIEW_SERVICE_URL;

if (!reviewServiceUrl) {
  throw new Error("REVIEW_SERVICE_URL is missing");
}

const client = createServiceClient({
  service: "review",
  instances: [reviewServiceUrl],
  failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 3),
  resetTimeoutMs: Number(process.env.CIRCUIT_RESET_TIMEOUT_MS ?? 10000),
  timeoutMs: Number(process.env.DOWNSTREAM_TIMEOUT_MS ?? 2000),
});

export async function getReviewsByProductId(productId) {
  const query = new URLSearchParams({ productId });
  const result = await client.request(`/reviews?${query}`, {
    validateResponse(data) {
      if (!Array.isArray(data?.data)) {
        throw new Error("Review Service returned an invalid response");
      }
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Review Service returned status ${result.status}`);
  }

  return result.data.data;
}

export function getReviewCircuitStates() {
  return client.snapshot();
}
