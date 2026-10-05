import 'dotenv/config';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { PrismaClient } = pkg;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const res = await prisma.tenant.upsert({
      where: { id: 'TID-NAMACABANG' },
      update: {},
      create: { id: 'TID-NAMACABANG', name: 'Srikandi Cabang' }
    });
    console.log('OK, Tenant created:', res);
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main();
