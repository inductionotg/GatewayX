import app from "./app.js";
import prisma from "./config/db.js";
import { getDummyHash } from "./utils/password.js";

const port = Number(process.env.PORT ?? 3105);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await prisma.$connect();
  await getDummyHash();
  const server = app.listen(port, host, () => {
    console.log(`User Service running at http://${host}:${port}`);
  });
  server.on("error", async (error) => {
    console.error("User Service could not listen", { code: error.code });
    await prisma.$disconnect();
    process.exitCode = 1;
  });
} catch (error) {
  console.error("User Service startup failed", { name: error.name, code: error.code });
  await prisma.$disconnect();
  process.exitCode = 1;
}
