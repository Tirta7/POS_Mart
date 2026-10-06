import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
prisma.user.findMany().then(u => { console.log(JSON.stringify(u, null, 2)); prisma.$disconnect() });
