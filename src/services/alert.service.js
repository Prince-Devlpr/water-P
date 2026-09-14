const { prisma } = require('../config/database');
const { ALERT_TYPES, ALERT_SEVERITY } = require('../utils/constants');
const { determineWaterLevelStatus } = require('../utils/calculations');
const { emitAlert } = require('../sockets/socket');

class AlertService {
  constructor() {
    // In-memory state tracking to deduplicate alerts across telemetry intervals
    // Map<tankId, lastStateType>
    this.tankStateMap = new Map();
  }

  /**
   * Evaluates current water level and creates a database alert ONLY on state change.
   * Prevents spamming alerts on continuous readings.
   *
   * @param {Object} tank - Tank database record
   * @param {number} levelPercent - Current water level percentage
   * @returns {Promise<Object|null>} Created alert or null if unchanged
   */
  async evaluateAndAlert(tank, levelPercent) {
    const status = determineWaterLevelStatus(levelPercent, tank.lowThreshold, tank.fullThreshold);
    const lastState = this.tankStateMap.get(tank.id);

    // If level returned to normal
    if (status.type === ALERT_TYPES.NORMAL) {
      if (lastState && lastState !== ALERT_TYPES.NORMAL) {
        console.log(`ℹ️ Tank #${tank.id} (${tank.name}) returned to NORMAL level (${levelPercent}%).`);
        this.tankStateMap.set(tank.id, ALERT_TYPES.NORMAL);
      }
      return null;
    }

    // If state has not changed (e.g., still LOW_LEVEL or still TANK_FULL), do not duplicate alert
    if (lastState === status.type) {
      return null;
    }

    // State transitioned to a new alert state (e.g. NORMAL -> LOW_LEVEL or LOW_LEVEL -> CRITICAL_LOW)
    try {
      const alert = await prisma.alert.create({
        data: {
          tankId: tank.id,
          type: status.type,
          severity: status.severity,
          message: status.message,
          isRead: false,
        },
      });

      this.tankStateMap.set(tank.id, status.type);
      console.log(`🚨 New Alert for Tank #${tank.id} [${status.type}]: ${status.message}`);

      // Broadcast via WebSocket
      emitAlert(tank.id, alert);

      return alert;
    } catch (error) {
      console.error(`❌ Failed to save alert for tank #${tank.id}:`, error.message);
      return null;
    }
  }

  /**
   * Retrieves alerts for a given tank
   */
  async getAlertsByTank(tankId, { limit = 50, isRead } = {}) {
    const where = { tankId: Number(tankId) };
    if (typeof isRead === 'boolean') {
      where.isRead = isRead;
    }

    return prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
  }

  /**
   * Marks a specific alert as read
   */
  async markAsRead(alertId) {
    return prisma.alert.update({
      where: { id: Number(alertId) },
      data: { isRead: true },
    });
  }

  /**
   * Marks all unread alerts for a tank as read
   */
  async markAllAsRead(tankId) {
    return prisma.alert.updateMany({
      where: { tankId: Number(tankId), isRead: false },
      data: { isRead: true },
    });
  }
}

module.exports = new AlertService();
