import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";

// Run from the repository root. Never overwrite existing configuration.
function create(path, content) {
  if (existsSync(path)) { console.log(`Kept ${path}`); return; }
  writeFileSync(path, content);
  console.log(`Created ${path}`);
}
create(".env", readFileSync(".env.example", "utf8"));
const root = parseEnv(readFileSync(".env", "utf8"));
const secret = randomBytes(48).toString("hex");
create("gateway/.env.docker", readFileSync("gateway/.env.docker.example", "utf8")
  .replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${secret}`));
create("gateway/.env", readFileSync("gateway/.env.example", "utf8")
  .replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${secret}`)
  .replace("redis://127.0.0.1:6380", `redis://127.0.0.1:${root.REDIS_PORT}`));
for (const [service, port] of [["product-service", 3102], ["review-service", 3103], ["user-service", 3105]]) {
  const folder = `services/${service}`;
  create(`${folder}/.env.docker`, readFileSync(`${folder}/.env.docker.example`, "utf8"));
  const values = parseEnv(readFileSync(`${folder}/.env.docker`, "utf8"));
  values.PORT = String(port);
  if (service === "user-service") values.HOST = "127.0.0.1";
  for (const key of ["DATABASE_URL", "SHADOW_DATABASE_URL"]) {
    const url = new URL(values[key]);
    url.hostname = "127.0.0.1";
    url.port = root.POSTGRES_PORT;
    values[key] = url.href;
  }
  create(`${folder}/.env`, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n");
}
console.log("Local configuration ready. Existing databases must match the configured credentials.");
