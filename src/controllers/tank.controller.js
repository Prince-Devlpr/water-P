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
          currentReading: t.sensorReadings[0] || null,
          hasActiveAlert: t.alerts.length > 0,
          createdAt: t.createdAt,
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
        data: tank,
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
      const { name, capacityLiters, tankDepthCm, lowThreshold, fullThreshold } = req.body;

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
        },
      });

      res.json({
        success: true,
        data: updated,
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
}

module.exports = new TankController();
