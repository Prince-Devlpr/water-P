const sensorService = require('../services/sensor.service');

class SensorController {
  /**
   * Get historical readings for a tank
   */
  async getReadings(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { limit = 100, from, to } = req.query;

      const readings = await sensorService.getTankReadings(tankId, {
        limit: Number(limit),
        from,
        to,
      });

      res.json({
        success: true,
        count: readings.length,
        data: readings,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SensorController();
