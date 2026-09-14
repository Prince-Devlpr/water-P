const { prisma } = require('../config/database');

class AnalyticsService {
  /**
   * Daily Analytics (Past 24 Hours)
   * Hourly breakdown of water levels, min/max, and pump activations.
   *
   * @param {number} tankId
   */
  async getDailyAnalytics(tankId) {
    const id = Number(tankId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [readings, pumpEvents] = await Promise.all([
      prisma.sensorReading.findMany({
        where: { tankId: id, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.pumpEvent.findMany({
        where: { tankId: id, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group into 24 hourly buckets
    const hourlyMap = new Map();
    for (let i = 0; i < 24; i++) {
      const bucketTime = new Date(since.getTime() + i * 60 * 60 * 1000);
      const hourKey = bucketTime.toISOString().slice(0, 13) + ':00';
      hourlyMap.set(hourKey, { levels: [], liters: [] });
    }

    readings.forEach((r) => {
      const key = r.createdAt.toISOString().slice(0, 13) + ':00';
      if (hourlyMap.has(key)) {
        hourlyMap.get(key).levels.push(r.waterLevelPercent);
        hourlyMap.get(key).liters.push(r.waterLevelLiters);
      }
    });

    const hourlyTrend = Array.from(hourlyMap.entries()).map(([hour, data]) => {
      const count = data.levels.length;
      const avgLevel = count ? data.levels.reduce((a, b) => a + b, 0) / count : 0;
      const avgLiters = count ? data.liters.reduce((a, b) => a + b, 0) / count : 0;
      const minLevel = count ? Math.min(...data.levels) : 0;
      const maxLevel = count ? Math.max(...data.levels) : 0;

      return {
        hour,
        readingCount: count,
        avgLevelPercent: Number(avgLevel.toFixed(1)),
        avgLiters: Number(avgLiters.toFixed(1)),
        minLevelPercent: Number(minLevel.toFixed(1)),
        maxLevelPercent: Number(maxLevel.toFixed(1)),
      };
    });

    const pumpActivations = pumpEvents.filter((e) => e.status === 'ON').length;

    return {
      period: '24h',
      totalReadings: readings.length,
      pumpActivations,
      hourlyTrend,
    };
  }

  /**
   * Weekly Analytics (Past 7 Days)
   * Daily breakdown of average levels and estimated consumption.
   *
   * @param {number} tankId
   */
  async getWeeklyAnalytics(tankId) {
    const id = Number(tankId);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [readings, pumpEvents] = await Promise.all([
      prisma.sensorReading.findMany({
        where: { tankId: id, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.pumpEvent.findMany({
        where: { tankId: id, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group by Day (YYYY-MM-DD)
    const dailyMap = new Map();
    for (let i = 0; i < 7; i++) {
      const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = day.toISOString().slice(0, 10);
      dailyMap.set(dateKey, { levels: [], liters: [], readings: [] });
    }

    readings.forEach((r) => {
      const dateKey = r.createdAt.toISOString().slice(0, 10);
      if (dailyMap.has(dateKey)) {
        dailyMap.get(dateKey).levels.push(r.waterLevelPercent);
        dailyMap.get(dateKey).liters.push(r.waterLevelLiters);
        dailyMap.get(dateKey).readings.push(r);
      }
    });

    const dailyTrend = Array.from(dailyMap.entries()).map(([date, data]) => {
      const count = data.levels.length;
      const avgLevel = count ? data.levels.reduce((a, b) => a + b, 0) / count : 0;
      const avgLiters = count ? data.liters.reduce((a, b) => a + b, 0) / count : 0;
      const minLevel = count ? Math.min(...data.levels) : 0;
      const maxLevel = count ? Math.max(...data.levels) : 0;

      // Estimate consumption: sum of drop differences when pump was OFF
      let estimatedConsumedLiters = 0;
      for (let i = 1; i < data.readings.length; i++) {
        const prev = data.readings[i - 1];
        const curr = data.readings[i];
        if (!prev.pumpStatus && curr.waterLevelLiters < prev.waterLevelLiters) {
          estimatedConsumedLiters += prev.waterLevelLiters - curr.waterLevelLiters;
        }
      }

      return {
        date,
        readingCount: count,
        avgLevelPercent: Number(avgLevel.toFixed(1)),
        avgLiters: Number(avgLiters.toFixed(1)),
        minLevelPercent: Number(minLevel.toFixed(1)),
        maxLevelPercent: Number(maxLevel.toFixed(1)),
        estimatedConsumedLiters: Number(estimatedConsumedLiters.toFixed(1)),
      };
    });

    const totalConsumedLiters = dailyTrend.reduce((sum, d) => sum + d.estimatedConsumedLiters, 0);

    return {
      period: '7d',
      totalReadings: readings.length,
      totalPumpEvents: pumpEvents.length,
      estimatedWeeklyConsumptionLiters: Number(totalConsumedLiters.toFixed(1)),
      dailyTrend,
    };
  }

  /**
   * Monthly Analytics (Past 30 Days)
   *
   * @param {number} tankId
   */
  async getMonthlyAnalytics(tankId) {
    const id = Number(tankId);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const readings = await prisma.sensorReading.findMany({
      where: { tankId: id, createdAt: { gte: since } },
      select: { waterLevelPercent: true, waterLevelLiters: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailyMap = new Map();
    readings.forEach((r) => {
      const dateKey = r.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, []);
      }
      dailyMap.get(dateKey).push(r.waterLevelPercent);
    });

    const dailyStats = Array.from(dailyMap.entries()).map(([date, levels]) => {
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
      return {
        date,
        avgLevelPercent: Number(avg.toFixed(1)),
        minLevel: Math.min(...levels),
        maxLevel: Math.max(...levels),
      };
    });

    return {
      period: '30d',
      totalReadings: readings.length,
      dailyStats,
    };
  }
}

module.exports = new AnalyticsService();
