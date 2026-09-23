import app from "./app.js";
import prisma from "./config/db.js";

const port = Number(process.env.PORT ?? 3003);

try {
  await prisma.$connect();

  app.listen(port, () => {
    console.log(`Review Service running at http://localhost:${port}`);
  });
} catch (error) {
  console.error("Failed to connect to the reviews database:", error);
  await prisma.$disconnect();
  process.exitCode = 1;
}