const { ALERT_TYPES, ALERT_SEVERITY } = require('./constants');

/**
 * Calculates water level percentage from ultrasonic distance and tank depth.
 * Formula: ((tankDepthCm - distanceCm) / tankDepthCm) * 100
 *
 * @param {number} distanceCm - Measured distance from ultrasonic sensor to water surface in cm
 * @param {number} tankDepthCm - Total depth of the tank in cm
 * @returns {number} Water level percentage clamped between 0 and 100 (2 decimal places)
 */
function calculateWaterLevelPercent(distanceCm, tankDepthCm) {
  if (typeof tankDepthCm !== 'number' || tankDepthCm <= 0) {
    throw new Error('Tank depth must be a positive number');
  }

  const distance = Math.max(0, Number(distanceCm) || 0);
  const waterHeight = tankDepthCm - distance;
  const rawPercentage = (waterHeight / tankDepthCm) * 100;

  const clamped = Math.max(0, Math.min(100, rawPercentage));
  return Number(clamped.toFixed(2));
}

/**
 * Calculates current water volume in liters based on level percentage and total capacity.
 *
 * @param {number} levelPercent - Water level percentage (0 - 100)
 * @param {number} capacityLiters - Total capacity of the tank in liters
 * @returns {number} Water volume in liters (2 decimal places)
 */
function calculateWaterVolumeLiters(levelPercent, capacityLiters) {
  if (typeof capacityLiters !== 'number' || capacityLiters <= 0) {
    throw new Error('Tank capacity must be a positive number');
  }

  const level = Math.max(0, Math.min(100, Number(levelPercent) || 0));
  const liters = (level / 100) * capacityLiters;
  return Number(liters.toFixed(2));
}

/**
 * Evaluates current water level against tank thresholds.
 *
 * @param {number} levelPercent - Current water level percentage
 * @param {number} [lowThreshold=20] - Low threshold percentage (default 20%)
 * @param {number} [fullThreshold=90] - Full threshold percentage (default 90%)
 * @returns {{ type: string, severity: string, message: string }} Status object
 */
function determineWaterLevelStatus(levelPercent, lowThreshold = 30, fullThreshold = 90) {
  const lowThresh = typeof lowThreshold === 'number' ? lowThreshold : 30;
  const criticalThreshold = Math.min(15, lowThresh / 2);

  if (levelPercent <= criticalThreshold) {
    return {
      type: ALERT_TYPES.CRITICAL_LOW,
      severity: ALERT_SEVERITY.CRITICAL,
      message: `Water level is critically low (${levelPercent}%). Refill immediately.`,
    };
  }

  if (levelPercent <= lowThresh) {
    return {
      type: ALERT_TYPES.LOW_LEVEL,
      severity: ALERT_SEVERITY.WARNING,
      message: `Water level is low (${levelPercent}% <= ${lowThresh}%). Refill recommended.`,
    };
  }

  if (levelPercent >= fullThreshold) {
    return {
      type: ALERT_TYPES.TANK_FULL,
      severity: ALERT_SEVERITY.INFO,
      message: `Tank is full (${levelPercent}%). Pump should be switched OFF.`,
    };
  }

  return {
    type: ALERT_TYPES.NORMAL,
    severity: ALERT_SEVERITY.INFO,
    message: `Water level is normal (${levelPercent}%).`,
  };
}

module.exports = {
  calculateWaterLevelPercent,
  calculateWaterVolumeLiters,
  determineWaterLevelStatus,
};
