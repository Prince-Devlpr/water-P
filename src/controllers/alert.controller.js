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
      const tankId = req.body.tankId ? Number(req.body.tankId) : null;

      if (tankId) {
        const result = await alertService.markAllAsRead(tankId);
        return res.json({
          success: true,
          message: 'All alerts marked as read for this tank.',
          data: result,
        });
      }

      // If tankId not specified, mark all unread alerts for the authenticated user
      const userTanks = await prisma.tank.findMany({
        where: { userId: req.user.id },
        select: { id: true },
      });
      const tankIds = userTanks.map((t) => t.id);

      const result = await prisma.alert.updateMany({
        where: { tankId: { in: tankIds }, isRead: false },
        data: { isRead: true },
      });

      res.json({
        success: true,
        message: 'All alerts marked as read.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AlertController();
