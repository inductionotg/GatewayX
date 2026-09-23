import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/index.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});

export default new PrismaClient({ adapter });
