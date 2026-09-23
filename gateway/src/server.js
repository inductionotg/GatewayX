import app from "./app.js";
import { redis } from "./config/redis.js";

const port = Number(process.env.PORT ?? 3200);

// Liveness remains available during Redis outages; API rate limiting fails closed.
void redis.connect().catch(() => console.error("Initial Redis connection failed"));
const server = app.listen(port, () => {
  console.log(`Gateway running at http://localhost:${server.address().port}`);
});
server.on("error", (error) => {
  console.error("Gateway could not listen", { code: error.code });
  if (redis.isOpen) redis.destroy();
  process.exitCode = 1;
});
