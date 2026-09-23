import prisma from "../src/config/db.js";

const reviews = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    productId: "11111111-1111-4111-8111-111111111111",
    authorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    rating: 5,
    comment: "Comfortable keyboard for coding.",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    productId: "11111111-1111-4111-8111-111111111111",
    authorId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    rating: 4,
    comment: "Good build quality, but slightly loud.",
  },
];

try {
  for (const review of reviews) {
    await prisma.review.upsert({
      where: { id: review.id },
      update: {},
      create: review,
    });
  }

  console.log("Sample reviews are ready.");
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}