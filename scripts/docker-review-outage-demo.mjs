import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const gateways = ["http://127.0.0.1:3320", "http://127.0.0.1:3321"];
const entry = "http://127.0.0.1:3380";
const productId = "11111111-1111-4111-8111-111111111111";
const path = `/api/products/${productId}/overview`;
const since = new Date().toISOString();
let stopped = false;
function docker(...args) {
  return execFileSync("docker", ["compose", "--profile", "apps", ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000,
  });
}
async function get(base, route) {
  const started = performance.now();
  const response = await fetch(base + route, {
    headers: { Connection: "close" }, signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, `Unexpected status for ${base}${route}`);
  return { data: await response.json(), ms: Math.round(performance.now() - started) };
}
async function overview(base, degraded) {
  const result = await get(base, path);
  assert.equal(result.data.data.product.id, productId);
  if (degraded) {
    assert.equal(result.data.data.reviews, null);
    assert.equal(result.data.warnings[0].code, "REVIEWS_UNAVAILABLE");
  } else {
    assert.ok(Array.isArray(result.data.data.reviews));
    assert.deepEqual(result.data.warnings, []);
  }
  return result.ms;
}
const states = async () => Promise.all(gateways.map(async base => (await get(base, "/debug/circuits")).data));
const calls = () => (docker("logs", "--since", since, "gateway-1", "gateway-2").match(/\[review\] Calling /g) ?? []).length;
try {
  for (const base of gateways) await overview(base, false);
  console.log("PASS: both gateways initially return products and reviews.");
  stopped = true;
  docker("stop", "-t", "1", "review-service");
  const latency = [];
  for (let i = 0; i < 3; i++) {
    for (const base of gateways) latency.push(await overview(base, true));
  }
  for (const snapshot of await states()) {
    assert.equal(snapshot.reviews[0].state, "OPEN");
    assert.ok(snapshot.products.every(c => c.state === "CLOSED"));
    assert.ok(snapshot.users.every(c => c.state === "CLOSED"));
  }
  const before = calls();
  const fast = [];
  for (const base of gateways) fast.push(await overview(base, true));
  for (let i = 0; i < 2; i++) await overview(entry, true);
  assert.equal(calls(), before, "open review circuits must not issue downstream calls");
  console.log(`PASS: six outage overviews stayed HTTP 200 with warnings; latencies=${latency.join(",")}ms. Both review circuits OPEN; product/user circuits CLOSED.`);
  console.log(`PASS: open circuits made zero additional review calls, including through entry; direct overview latencies=${fast.join(",")}ms.`);
  docker("up", "-d", "--wait", "review-service");
  stopped = false;
  const remaining = Math.max(...(await states()).map(s => s.reviews[0].retryAfterMs));
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining + 100));
  for (const base of gateways) await overview(base, false);
  for (const snapshot of await states()) assert.equal(snapshot.reviews[0].state, "CLOSED");
  for (const name of ["gateway-1", "gateway-2"]) {
    const logs = docker("logs", "--since", since, name);
    for (const transition of ["CLOSED -> OPEN", "OPEN -> HALF_OPEN", "HALF_OPEN -> CLOSED"]) {
      assert.ok(logs.includes(`review http://review-service:3003: ${transition}`));
    }
  }
  await overview(entry, false);
  console.log("PASS: both gateways recorded CLOSED -> OPEN -> HALF_OPEN -> CLOSED; reviews reappear without restarting gateways.");
} finally {
  if (stopped) docker("up", "-d", "--wait", "review-service");
}
