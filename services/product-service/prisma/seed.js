import prisma from "../src/config/db.js";
const products = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Mechanical Keyboard",
    description: "A compact keyboard for everyday coding.",
    priceCents: 249900,
    currency: "INR",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Wireless Mouse",
    description: "A rechargeable wireless mouse.",
    priceCents: 99900,
    currency: "INR",
  },
];

try {
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }

  console.log("Sample products are ready.");
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}