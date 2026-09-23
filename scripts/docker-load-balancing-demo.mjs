import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { createClient } from "redis";
import prisma from "../services/user-service/src/config/db.js";

const entry = "http://127.0.0.1:3380";
const gateways = ["http://127.0.0.1:3320", "http://127.0.0.1:3321"];
const config = dotenv.parse(readFileSync("gateway/.env.docker"));
const local = dotenv.parse(readFileSync("gateway/.env"));
const redis = createClient({ url: local.REDIS_URL, socket: { reconnectStrategy: false } });
redis.on("error", () => {});
const email = `balancing-${randomUUID()}@example.com`, password = randomUUID();
const since = new Date().toISOString();
let cookie, userId, productStopped = false, gatewayStopped = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(...args) {
  return execFileSync("docker", ["compose", "--profile", "apps", ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000,
  });
}
async function request(base, path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { Connection: "close", ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}
async function circuits(base) { return (await request(base, "/debug/circuits")).data.products; }
try {
  await redis.connect();
  const upstreams = new Set();
  for (let i = 0; i < 8; i++) {
    const response = await request(entry, "/health");
    assert.equal(response.status, 200);
    upstreams.add(response.headers.get("x-gateway-upstream"));
  }
  assert.equal(upstreams.size, 2);
  assert.ok(!upstreams.has(null));
  console.log("PASS: the single entry URL distributes requests across both gateways.");
  const registration = await request("http://127.0.0.1:3315", "/users", { name: "Balancing Demo", email, password });
  assert.equal(registration.status, 201);
  userId = registration.data.data.id;
  const login = await request(entry, "/api/auth/login", { email, password }, { Origin: entry });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  for (let i = 0; i < 8; i++) {
    assert.equal((await request(entry, "/api/products")).status, 200);
    await delay(550);
  }
  for (const name of ["gateway-1", "gateway-2"]) {
    const logs = docker("logs", "--since", since, name);
    assert.match(logs, /Calling http:\/\/product-service:3002\/products/);
    assert.match(logs, /Calling http:\/\/product-service-2:3002\/products/);
  }
  console.log("PASS: each gateway's custom round-robin client calls both product replicas.");

  productStopped = true;
  docker("stop", "-t", "1", "product-service-2");
  const outageStatuses = [];
  // Exercise each independently owned breaker. Pacing avoids rate-limit noise.
  for (let i = 0; i < 6; i++) {
    for (const base of gateways) {
      const result = await request(base, "/api/products");
      assert.ok([200, 502, 503, 504].includes(result.status), `Unexpected outage status ${result.status}`);
      outageStatuses.push(result.status);
      await delay(550);
    }
  }
  for (const base of gateways) assert.equal((await circuits(base)).find(c => c.instance.includes("product-service-2")).state, "OPEN");
  assert.ok(outageStatuses.some(status => status >= 500));
  for (const base of gateways) {
    const overview = await request(base, "/api/products/11111111-1111-4111-8111-111111111111/overview");
    assert.equal(overview.status, 200);
    assert.deepEqual(overview.data.warnings, []);
    assert.ok(Array.isArray(overview.data.data.reviews));
    await delay(550);
    assert.equal((await request(base, "/api/auth/me")).data.data.id, userId);
    await delay(550);
  }
  console.log(`PASS: stopped product replica trips both breakers; healthy products, reviews, and sessions continue. Initial statuses: ${outageStatuses.join(",")}`);
  docker("up", "-d", "--wait", "product-service-2");
  productStopped = false;
  const remaining = Math.max(...(await Promise.all(gateways.map(circuits))).flat().map(c => c.retryAfterMs));
  if (remaining > 0) await delay(remaining + 100);
  for (const base of gateways) {
    for (let i = 0; i < 2; i++) {
      assert.equal((await request(base, "/api/products")).status, 200);
      await delay(550);
    }
    assert.equal((await circuits(base)).find(c => c.instance.includes("product-service-2")).state, "CLOSED");
  }
  for (const name of ["gateway-1", "gateway-2"]) {
    const logs = docker("logs", "--since", since, name);
    assert.match(logs, /product-service-2:3002: OPEN -> HALF_OPEN/);
    assert.match(logs, /product-service-2:3002: HALF_OPEN -> CLOSED/);
  }
  console.log("PASS: both gateway logs show OPEN -> HALF_OPEN -> CLOSED after recovery.");

  gatewayStopped = true;
  docker("stop", "-t", "1", "gateway-1");
  for (let i = 0; i < 4; i++) assert.equal((await request(entry, "/health")).status, 200);
  assert.equal((await request(entry, "/api/auth/me")).data.data.id, userId);
  console.log("PASS: entry URL and existing session still work with gateway-1 stopped.");
  docker("up", "-d", "--wait", "gateway-1");
  gatewayStopped = false;
} finally {
  try {
    if (productStopped) docker("up", "-d", "--wait", "product-service-2");
    if (gatewayStopped) docker("up", "-d", "--wait", "gateway-1");
  } finally {
    try {
      await prisma.user.deleteMany({ where: { email } });
      if (redis.isReady && cookie) {
        const sid = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).slice(2).split(".")[0];
        await redis.del(config.SESSION_REDIS_PREFIX + sid);
      }
      if (redis.isReady && userId) await redis.del(config.RATE_LIMIT_PREFIX + "user:" + createHash("sha256").update(userId).digest("hex"));
    } finally {
      await prisma.$disconnect();
      if (redis.isOpen) redis.destroy();
    }
  }
}
