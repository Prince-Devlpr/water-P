const pumpService = require('../services/pump.service');
const { PUMP_STATUS, PUMP_SOURCES, PUMP_REASONS } = require('../utils/constants');

class PumpController {
  /**
   * Turn pump ON manually via App
   */
  async turnPumpOn(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { reason = PUMP_REASONS.USER_COMMAND } = req.body;

      const event = await pumpService.setPumpState(
        tankId,
        PUMP_STATUS.ON,
        PUMP_SOURCES.APP,
        reason
      );

      res.json({
        success: true,
        message: 'Pump ON command successfully dispatched to device.',
        data: event,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Turn pump OFF manually via App
   */
  async turnPumpOff(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { reason = PUMP_REASONS.USER_COMMAND } = req.body;

      const event = await pumpService.setPumpState(
        tankId,
        PUMP_STATUS.OFF,
        PUMP_SOURCES.APP,
        reason
      );

      res.json({
        success: true,
        message: 'Pump OFF command successfully dispatched to device.',
        data: event,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pump activation history
   */
  async getHistory(req, res, next) {
    try {
      const tankId = Number(req.params.id);
      const { limit = 50 } = req.query;

      const events = await pumpService.getPumpHistory(tankId, {
        limit: Number(limit),
      });

      res.json({
        success: true,
        count: events.length,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PumpController();
