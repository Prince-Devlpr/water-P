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

  /**
   * HTTP Telemetry Ingestion endpoint for ESP devices
   * POST /api/tanks/telemetry or POST /api/tanks/:id/readings
   */
  async postReading(req, res, next) {
    try {
      const deviceId = req.body.deviceId || 'ESP8266_001';
      const result = await sensorService.recordReading(deviceId, req.body);

      if (!result) {
        return res.status(400).json({
          success: false,
          error: 'Failed to record reading. Ensure deviceId is valid and distance is provided.',
        });
      }

      res.status(201).json({
        success: true,
        message: 'Reading recorded successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SensorController();
