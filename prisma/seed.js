const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create or find demo user
  const email = 'prince@gmail.com';
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    user = await prisma.user.create({
      data: {
        name: 'Prince',
        email,
        passwordHash,
      },
    });
    console.log(`👤 Created demo user: ${user.email} (Password: password123)`);
  } else {
    console.log(`👤 Demo user already exists: ${user.email}`);
  }

  // 2. Create or find demo tank
  const deviceId = 'ESP8266_001';
  let tank = await prisma.tank.findUnique({ where: { deviceId } });

  if (!tank) {
    tank = await prisma.tank.create({
      data: {
        userId: user.id,
        deviceId,
        name: 'Home Tank',
        capacityLiters: 1000.0,
        tankDepthCm: 100.0,
        lowThreshold: 20.0,
        fullThreshold: 90.0,
      },
    });
    console.log(`🚰 Created demo tank: ${tank.name} (Device: ${tank.deviceId})`);
  } else {
    console.log(`🚰 Demo tank already exists: ${tank.name}`);
  }

  // 3. Seed historical readings over the past 24 hours
  const existingCount = await prisma.sensorReading.count({ where: { tankId: tank.id } });
  if (existingCount === 0) {
    console.log('📊 Seeding historical sensor readings for the past 24 hours...');
    const now = Date.now();
    const readingsData = [];

    // Simulate 24 hourly readings
    for (let i = 24; i >= 0; i--) {
      const timestamp = new Date(now - i * 60 * 60 * 1000);
      // Generate realistic fluctuating level between 30% and 85%
      const cycle = Math.sin((i / 24) * Math.PI * 2);
      const levelPercent = Number((60 + cycle * 25).toFixed(2));
      const distanceCm = Number((100 - levelPercent).toFixed(2));
      const liters = Number(((levelPercent / 100) * 1000).toFixed(2));
      const pumpStatus = levelPercent < 35;

      readingsData.push({
        tankId: tank.id,
        distanceCm,
        waterLevelPercent: levelPercent,
        waterLevelLiters: liters,
        pumpStatus,
        createdAt: timestamp,
      });
    }

    await prisma.sensorReading.createMany({
      data: readingsData,
    });
    console.log(`✅ Seeded ${readingsData.length} sensor readings.`);

    // 4. Seed sample pump events
    await prisma.pumpEvent.createMany({
      data: [
        {
          tankId: tank.id,
          status: 'ON',
          reason: 'LOW_LEVEL',
          source: 'AUTO',
          createdAt: new Date(now - 12 * 60 * 60 * 1000),
        },
        {
          tankId: tank.id,
          status: 'OFF',
          reason: 'TANK_FULL',
          source: 'AUTO',
          createdAt: new Date(now - 10 * 60 * 60 * 1000),
        },
        {
          tankId: tank.id,
          status: 'ON',
          reason: 'USER_COMMAND',
          source: 'APP',
          createdAt: new Date(now - 2 * 60 * 60 * 1000),
        },
      ],
    });
    console.log('⚡ Seeded sample pump events.');
  }

  console.log('🎉 Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
