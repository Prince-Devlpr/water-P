const alertService = require('../services/alert.service');

class AlertController {
  /**
   * Get all alerts for a tank
   */
  async getAlerts(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { limit = 50, isRead } = req.query;

      const parsedIsRead =
        isRead === 'true' ? true : isRead === 'false' ? false : undefined;

      const alerts = await alertService.getAlertsByTank(tankId, {
        limit: Number(limit),
        isRead: parsedIsRead,
      });

      res.json({
        success: true,
        count: alerts.length,
        data: alerts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a single alert as read
   */
  async markAsRead(req, res, next) {
    try {
      const alertId = Number(req.params.id);

      const alert = await alertService.markAsRead(alertId);

      res.json({
        success: true,
        message: 'Alert marked as read.',
        data: alert,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark all alerts for a tank as read
   */
  async markAllAsRead(req, res, next) {
    try {
      const tankId = Number(req.body.tankId || req.params.tankId);

      if (!tankId) {
        return res.status(400).json({
          success: false,
          error: 'tankId is required to mark all alerts as read.',
        });
      }

      const result = await alertService.markAllAsRead(tankId);

      res.json({
        success: true,
        message: `Marked ${result.count} alerts as read.`,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AlertController();
