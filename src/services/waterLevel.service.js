const {
  calculateWaterLevelPercent,
  calculateWaterVolumeLiters,
  determineWaterLevelStatus,
} = require('../utils/calculations');

/**
 * Water Level Service
 * Responsible for distance-to-percentage conversions, volume calculations,
 * and threshold evaluation.
 */
class WaterLevelService {
  /**
   * Processes a raw distance measurement against a tank's physical specifications.
   *
   * @param {number} distanceCm - Distance measured from ultrasonic sensor in cm
   * @param {Object} tank - Tank model instance containing dimensions and thresholds
   * @returns {Object} Processed water metrics
   */
  processDistance(distanceCm, tank) {
    const {
      tankDepthCm,
      capacityLiters,
      lowThreshold = 20,
      fullThreshold = 90,
    } = tank;

    const levelPercent = calculateWaterLevelPercent(distanceCm, tankDepthCm);
    const volumeLiters = calculateWaterVolumeLiters(levelPercent, capacityLiters);
    const status = determineWaterLevelStatus(levelPercent, lowThreshold, fullThreshold);

    return {
      distanceCm: Number(distanceCm),
      levelPercent,
      volumeLiters,
      status: status.type,
      severity: status.severity,
      message: status.message,
    };
  }
}

module.exports = new WaterLevelService();
