const { prisma } = require('../config/database');
const waterLevelService = require('./waterLevel.service');
const alertService = require('./alert.service');
const { emitTelemetry, emitPumpEvent } = require('../sockets/socket');
const { PUMP_STATUS, PUMP_SOURCES, PUMP_REASONS } = require('../utils/constants');

class SensorService {
  constructor() {
    // Cache last known pump state per tank: Map<tankId, boolean>
    this.tankPumpStateMap = new Map();
  }

  /**
   * Processes an incoming telemetry reading from an ESP8266 device.
   *
   * @param {string} deviceId - Device identifier (e.g. "ESP8266_001")
   * @param {Object} telemetry - Telemetry payload { distance: number, pump?: boolean }
   * @returns {Promise<Object|null>} Saved reading record or null if tank not found
   */
  async recordReading(deviceId, { distance, pump }) {
    if (distance === undefined || distance === null || isNaN(distance)) {
      console.warn(`⚠️ Invalid distance value received from device: ${deviceId}`);
      return null;
    }

    // Step 2 & 3: Find tank by deviceId
    const tank = await prisma.tank.findUnique({
      where: { deviceId },
    });

    if (!tank) {
      console.warn(`⚠️ Unregistered device reported telemetry: ${deviceId}`);
      return null;
    }

    // Step 4 & 5: Calculate level and status
    const distanceNum = parseFloat(distance);
    const metrics = waterLevelService.processDistance(distanceNum, tank);
    const pumpBool = typeof pump === 'boolean' ? pump : Boolean(pump === 'true' || pump === 1 || pump === 'ON');

    // Step 7: Save reading to PostgreSQL
    const reading = await prisma.sensorReading.create({
      data: {
        tankId: tank.id,
        distanceCm: metrics.distanceCm,
        waterLevelPercent: metrics.levelPercent,
        waterLevelLiters: metrics.volumeLiters,
        pumpStatus: pumpBool,
      },
    });

    // Step 8: Evaluate threshold alerts (with state-change deduplication)
    const alert = await alertService.evaluateAndAlert(tank, metrics.levelPercent);

    // Track automatic pump state transitions from the ESP8266 hardware relay
    const lastPumpStatus = this.tankPumpStateMap.get(tank.id);
    if (lastPumpStatus !== undefined && lastPumpStatus !== pumpBool) {
      const newStatus = pumpBool ? PUMP_STATUS.ON : PUMP_STATUS.OFF;
      const autoReason = pumpBool ? PUMP_REASONS.LOW_LEVEL : PUMP_REASONS.TANK_FULL;

      const pumpEvent = await prisma.pumpEvent.create({
        data: {
          tankId: tank.id,
          status: newStatus,
          reason: autoReason,
          source: PUMP_SOURCES.AUTO,
        },
      });

      emitPumpEvent(tank.id, pumpEvent);
      console.log(`⚡ Pump status changed to ${newStatus} on Tank #${tank.id} (Source: AUTO)`);
    }
    this.tankPumpStateMap.set(tank.id, pumpBool);

    // Step 9: Broadcast live telemetry update via Socket.IO
    const liveUpdate = {
      id: reading.id,
      tankId: tank.id,
      deviceId: tank.deviceId,
      distanceCm: metrics.distanceCm,
      waterLevelPercent: metrics.levelPercent,
      waterLevelLiters: metrics.volumeLiters,
      pumpStatus: pumpBool,
      status: metrics.status,
      severity: metrics.severity,
      alert: alert ? { id: alert.id, type: alert.type, message: alert.message } : null,
      createdAt: reading.createdAt,
    };

    emitTelemetry(tank.id, liveUpdate);

    return liveUpdate;
  }

  /**
   * Retrieves historical sensor readings for a tank with pagination and date filters.
   */
  async getTankReadings(tankId, { limit = 100, from, to } = {}) {
    const where = { tankId: Number(tankId) };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    return prisma.sensorReading.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(1000, Math.max(1, Number(limit))),
    });
  }

  /**
   * Fetches latest real-time status summary for a tank.
   */
  async getTankCurrentStatus(tankId) {
    const id = Number(tankId);

    const tank = await prisma.tank.findUnique({
      where: { id },
      include: {
        sensorReadings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        pumpEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        alerts: {
          where: { isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tank) return null;

    const latestReading = tank.sensorReadings[0] || null;
    const latestPumpEvent = tank.pumpEvents[0] || null;
    const latestAlert = tank.alerts[0] || null;

    let status = 'UNKNOWN';
    let severity = 'INFO';
    if (latestReading) {
      const evaluated = waterLevelService.processDistance(latestReading.distanceCm, tank);
      status = evaluated.status;
      severity = evaluated.severity;
    }

    return {
      tank: {
        id: tank.id,
        name: tank.name,
        deviceId: tank.deviceId,
        capacityLiters: tank.capacityLiters,
        tankDepthCm: tank.tankDepthCm,
        lowThreshold: tank.lowThreshold,
        fullThreshold: tank.fullThreshold,
      },
      current: latestReading
        ? {
            levelPercent: latestReading.waterLevelPercent,
            volumeLiters: latestReading.waterLevelLiters,
            distanceCm: latestReading.distanceCm,
            pumpStatus: latestReading.pumpStatus,
            status,
            severity,
            lastUpdated: latestReading.createdAt,
          }
        : null,
      latestPumpEvent,
      activeAlert: latestAlert,
    };
  }
}

module.exports = new SensorService();
