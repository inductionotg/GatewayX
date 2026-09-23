import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const gatewayDir = fileURLToPath(new URL("../gateway/", import.meta.url));
const config = dotenv.parse(readFileSync(new URL("../gateway/.env", import.meta.url)));
const rateMode = process.argv.includes("--rate-limit");
const demoPrefix = `gatewayx:live-demo:${randomUUID()}:`;
config.RATE_LIMIT_PREFIX = demoPrefix + "rate:";
config.SESSION_REDIS_PREFIX = demoPrefix + "sessions:";
if (rateMode) {
  // Slow refill isolates atomic admission counts from elapsed wall-clock time.
  config.RATE_LIMIT_USER_CAPACITY = "10";
  config.RATE_LIMIT_USER_REFILL_PER_SECOND = "0.001";
}
const userConfig = dotenv.parse(readFileSync(new URL("../services/user-service/.env", import.meta.url)));
const email = `session-live-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString("hex");
const processes = new Set();
const cookies = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const database = new pg.Client({ connectionString: userConfig.DATABASE_URL });
const { createClient } = await import("redis");
const redis = createClient({ url: config.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 2000 } });
redis.on("error", () => {});

async function startGateway() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: gatewayDir,
    env: { ...process.env, ...config, PORT: "0" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.add(child);
  let base;
  let exited = false;
  child.once("exit", () => { exited = true; });
  child.stdout.on("data", (chunk) => {
    const port = chunk.toString().match(/Gateway running at http:\/\/localhost:(\d+)/)?.[1];
    if (port) base = `http://127.0.0.1:${port}`;
  });
  child.stderr.on("data", () => {});
  for (let i = 0; i < 150; i++) {
    if (exited) throw new Error("Demo gateway exited during startup");
    if (base) {
      const r = await fetch(base + "/api/auth/me");
      await r.arrayBuffer();
      if (r.status === 401) return { child, base };
    }
    await delay(100);
  }
  throw new Error("Demo gateway did not become ready");
}

async function stopGateway(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  processes.delete(child);
}

async function request(base, path, { body, cookie } = {}) {
  return fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}

try {
  await database.connect();
  await redis.connect();
  let first = await startGateway();
  const second = await startGateway();
  const registration = await request(first.base, "/api/users", { body: { name: "Session live test", email, password } });
  assert.equal(registration.status, 201);
  const user = (await registration.json()).data;
  const login = await request(first.base, "/api/auth/login", { body: { email, password } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  cookies.add(cookie);
  if (rateMode) {
    const gateways = [first, second];
    const started = performance.now();
    const results = await Promise.all(Array.from({ length: 200 }, async (_, i) => {
      const response = await request(gateways[i % 2].base, "/api/auth/me", { cookie });
      await response.arrayBuffer();
      if (response.status === 429) {
        assert.ok(Number(response.headers.get("retry-after")) >= 1);
        assert.equal(response.headers.get("x-ratelimit-policy"), "user");
      }
      return response.status;
    }));
    const accepted = results.filter((status) => status === 200).length;
    const rejected = results.filter((status) => status === 429).length;
    assert.equal(accepted, 10);
    assert.equal(rejected, 190);
    console.log(JSON.stringify({ requests: 200, gateways: 2, accepted, rejected,
      elapsedMs: Math.round(performance.now() - started), capacity: 10, refillPerSecond: 0.001 }));
    await stopGateway(first.child);
    first = await startGateway();
    assert.equal((await request(first.base, "/api/auth/me", { cookie })).status, 429);
    console.log("PASS: a gateway process restart does not reset the shared rate allowance");
  } else {
  assert.equal((await (await request(second.base, "/api/auth/me", { cookie })).json()).data.id, user.id);
  console.log("PASS: login through gateway A, same session recognized by gateway B");
  await stopGateway(first.child);
  first = await startGateway();
  assert.equal((await (await request(first.base, "/api/auth/me", { cookie })).json()).data.id, user.id);
  console.log("PASS: session survives terminating and restarting gateway A's Node process");
  assert.equal((await request(second.base, "/api/auth/logout", { cookie, body: {} })).status, 204);
  for (const gateway of [first, second]) {
    assert.equal((await request(gateway.base, "/api/auth/me", { cookie })).status, 401);
  }
  console.log("PASS: logout through gateway B invalidates the original cookie on both gateways");
  }
} finally {
  await Promise.all([...processes].map(stopGateway));
  if (redis.isReady) {
    for (const cookie of cookies) {
      const sid = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).slice(2).split(".")[0];
      await redis.del((config.SESSION_REDIS_PREFIX ?? "gatewayx:sessions:") + sid);
    }
    const demoKeys = [];
    for await (const batch of redis.scanIterator({ MATCH: demoPrefix + "*" })) demoKeys.push(...batch);
    if (demoKeys.length) await redis.del(demoKeys);
  }
  try { await database.query("DELETE FROM users WHERE email = $1", [email]); }
  finally { await database.end(); if (redis.isOpen) redis.destroy(); }
}
