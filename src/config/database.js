const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Checks whether PostgreSQL database connection is operational
 * @returns {Promise<boolean>}
 */
async function checkDbConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database connection check failed:', error.message);
    return false;
  }
}

module.exports = {
  prisma,
  checkDbConnection,
};
