const analyticsService = require('../services/analytics.service');

class AnalyticsController {
  /**
   * Daily analytics (24 hours)
   */
  async getDaily(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const data = await analyticsService.getDailyAnalytics(tankId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Weekly analytics (7 days)
   */
  async getWeekly(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const data = await analyticsService.getWeeklyAnalytics(tankId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Monthly analytics (30 days)
   */
  async getMonthly(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const data = await analyticsService.getMonthlyAnalytics(tankId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AnalyticsController();
