import { createClient } from "redis";

export function createRedisConnection(url = process.env.REDIS_URL) {
  if (!url) throw new Error("REDIS_URL is required");
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: (attempt) => Math.min(100 * (attempt + 1), 2000) },
  });
  client.on("error", (error) => console.error("Redis connection error", { code: error.code }));
  return client;
}

// Connection is started by server.js, not by importing the application in tests.
export const redis = createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6380");
