const { prisma } = require('../config/database');
const sensorService = require('../services/sensor.service');

class TankController {
  /**
   * Create a new tank
   */
  async createTank(req, res, next) {
    try {
      const {
        name,
        deviceId,
        capacityLiters = 1000,
        tankDepthCm = 100,
        lowThreshold = 20,
        fullThreshold = 90,
      } = req.body;

      // Check if deviceId already registered
      const existing = await prisma.tank.findUnique({
        where: { deviceId },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Device ID '${deviceId}' is already assigned to another tank.`,
        });
      }

      const tank = await prisma.tank.create({
        data: {
          userId: req.user.id,
          name,
          deviceId,
          capacityLiters: parseFloat(capacityLiters),
          tankDepthCm: parseFloat(tankDepthCm),
          lowThreshold: parseFloat(lowThreshold),
          fullThreshold: parseFloat(fullThreshold),
        },
      });

      res.status(201).json({
        success: true,
        data: tank,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all tanks owned by the authenticated user
   */
  async getTanks(req, res, next) {
    try {
      const tanks = await prisma.tank.findMany({
        where: { userId: req.user.id },
        include: {
          sensorReadings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          alerts: {
            where: { isRead: false },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: tanks.map((t) => ({
          id: t.id,
          name: t.name,
          deviceId: t.deviceId,
          capacityLiters: t.capacityLiters,
          tankDepthCm: t.tankDepthCm,
          lowThreshold: t.lowThreshold,
          fullThreshold: t.fullThreshold,
          autoMode: t.autoMode,
          autoPumpEnabled: t.autoMode,
          currentReading: t.sensorReadings[0] || null,
          currentLevelPct: t.sensorReadings[0]?.waterLevelPercent ?? 0,
          currentVolumeLiters: t.sensorReadings[0]?.waterLevelLiters ?? 0,
          currentDistanceCm: t.sensorReadings[0]?.distanceCm ?? 0,
          currentFlowRate: t.sensorReadings[0]?.flowRate ?? 0.0,
          currentTotalLiters: t.sensorReadings[0]?.totalLiters ?? 0.0,
          currentTdsPpm: t.sensorReadings[0]?.tdsPpm ?? 220,
          currentMode: t.sensorReadings[0]?.mode ?? (t.autoMode ? 'AUTO' : 'MANUAL'),
          pumpStatus: t.sensorReadings[0]?.pumpStatus ? 'ON' : 'OFF',
          hasActiveAlert: t.alerts.length > 0,
          createdAt: t.createdAt,
          // Aliases for mobile app setup screen
          maxCapacityLiters: t.capacityLiters,
          heightCm: t.tankDepthCm,
          criticalLowPct: t.lowThreshold,
          criticalHighPct: t.fullThreshold,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single tank details
   */
  async getTankById(req, res, next) {
    try {
      const tankId = Number(req.params.id);

      const tank = await prisma.tank.findFirst({
        where: { id: tankId, userId: req.user.id },
      });

      if (!tank) {
        return res.status(404).json({
          success: false,
          error: 'Tank not found or you do not have permission to view it.',
        });
      }

      res.json({
        success: true,
        data: {
          ...tank,
          maxCapacityLiters: tank.capacityLiters,
          heightCm: tank.tankDepthCm,
          criticalLowPct: tank.lowThreshold,
          criticalHighPct: tank.fullThreshold,
          autoPumpEnabled: tank.autoMode,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update tank parameters (dimensions, thresholds)
   */
  async updateTank(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { name } = req.body;
      const capacityLiters = req.body.capacityLiters ?? req.body.maxCapacityLiters;
      const tankDepthCm = req.body.tankDepthCm ?? req.body.heightCm;
      const lowThreshold = req.body.lowThreshold ?? req.body.criticalLowPct;
      const fullThreshold = req.body.fullThreshold ?? req.body.criticalHighPct;
      const autoMode = req.body.autoMode ?? req.body.autoPumpEnabled;

      const tank = await prisma.tank.findFirst({
        where: { id: tankId, userId: req.user.id },
      });

      if (!tank) {
        return res.status(404).json({
          success: false,
          error: 'Tank not found or you do not have permission to modify it.',
        });
      }

      const updated = await prisma.tank.update({
        where: { id: tankId },
        data: {
          ...(name && { name }),
          ...(capacityLiters !== undefined && { capacityLiters: parseFloat(capacityLiters) }),
          ...(tankDepthCm !== undefined && { tankDepthCm: parseFloat(tankDepthCm) }),
          ...(lowThreshold !== undefined && { lowThreshold: parseFloat(lowThreshold) }),
          ...(fullThreshold !== undefined && { fullThreshold: parseFloat(fullThreshold) }),
          ...(autoMode !== undefined && { autoMode: Boolean(autoMode) }),
        },
      });

      res.json({
        success: true,
        data: {
          ...updated,
          maxCapacityLiters: updated.capacityLiters,
          heightCm: updated.tankDepthCm,
          criticalLowPct: updated.lowThreshold,
          criticalHighPct: updated.fullThreshold,
          autoPumpEnabled: updated.autoMode,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current live status of the tank
   */
  async getCurrentStatus(req, res, next) {
    try {
      const tankId = Number(req.params.id);

      const status = await sensorService.getTankCurrentStatus(tankId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Tank not found.',
        });
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle between AUTOMATIC and MANUAL mode
   */
  async setControlMode(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { mode } = req.body; // 'AUTO' or 'MANUAL'
      const isAuto = String(mode).toUpperCase() === 'AUTO';

      const tank = await prisma.tank.update({
        where: { id: tankId },
        data: { autoMode: isAuto },
      });

      const { mqttClient } = require('../config/mqtt');
      const { MQTT_TOPICS } = require('../utils/constants');
      const { emitModeChange } = require('../sockets/socket');

      // Publish mode command to ESP32 / ESP8266
      const mainTopic = MQTT_TOPICS.COMMAND(tank.deviceId);
      const subTopic = MQTT_TOPICS.COMMAND_MODE(tank.deviceId);
      const payload = JSON.stringify({ command: isAuto ? 'AUTO' : 'MANUAL', mode: isAuto ? 'AUTO' : 'MANUAL' });

      mqttClient.publish(mainTopic, payload, { qos: 1 });
      mqttClient.publish(subTopic, payload, { qos: 1 });

      emitModeChange(tank.id, isAuto ? 'AUTO' : 'MANUAL');

      res.json({
        success: true,
        message: `Control mode set to ${isAuto ? 'AUTO' : 'MANUAL'}`,
        data: { autoMode: isAuto, mode: isAuto ? 'AUTO' : 'MANUAL' },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TankController();
