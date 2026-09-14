const { prisma } = require('../config/database');
const { mqttClient } = require('../config/mqtt');
const { MQTT_TOPICS, PUMP_STATUS, PUMP_SOURCES, PUMP_REASONS } = require('../utils/constants');
const { emitPumpEvent } = require('../sockets/socket');

class PumpService {
  /**
   * Dispatches a remote pump command (ON or OFF) to the ESP8266 device via MQTT.
   *
   * @param {number} tankId - Target tank ID
   * @param {'ON'|'OFF'} state - Desired pump state
   * @param {string} [source='APP'] - Command trigger source ('APP', 'MANUAL')
   * @param {string} [reason='USER_COMMAND'] - Reason for state change
   * @returns {Promise<Object>} Created pump event record
   */
  async setPumpState(tankId, state, source = PUMP_SOURCES.APP, reason = PUMP_REASONS.USER_COMMAND) {
    const id = Number(tankId);
    const targetState = state.toUpperCase();

    if (![PUMP_STATUS.ON, PUMP_STATUS.OFF].includes(targetState)) {
      throw new Error(`Invalid pump state: ${state}. Must be ON or OFF.`);
    }

    const tank = await prisma.tank.findUnique({
      where: { id },
      include: {
        sensorReadings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tank) {
      throw new Error(`Tank not found with ID ${tankId}`);
    }

    // Safety check: Prevent turning ON pump if tank is already full (unless forced)
    const latestReading = tank.sensorReadings[0];
    if (targetState === PUMP_STATUS.ON && latestReading) {
      if (latestReading.waterLevelPercent >= tank.fullThreshold) {
        throw new Error(
          `Safety lock: Cannot start pump. Water level (${latestReading.waterLevelPercent}%) has reached or exceeded full threshold (${tank.fullThreshold}%).`
        );
      }
    }

    // Step: Publish MQTT command to ESP8266
    const commandTopic = MQTT_TOPICS.COMMAND_PUMP(tank.deviceId);
    const payload = JSON.stringify({ state: targetState });

    await new Promise((resolve, reject) => {
      mqttClient.publish(commandTopic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ Failed to publish pump command to ${commandTopic}:`, err.message);
          return reject(new Error('Failed to dispatch MQTT command to device'));
        }
        console.log(`📤 MQTT Command published to ${commandTopic}: ${payload}`);
        resolve();
      });
    });

    // Step: Record event in database
    const pumpEvent = await prisma.pumpEvent.create({
      data: {
        tankId: tank.id,
        status: targetState,
        reason,
        source,
      },
    });

    // Step: Broadcast via WebSocket
    emitPumpEvent(tank.id, pumpEvent);

    return pumpEvent;
  }

  /**
   * Retrieves pump event history for a tank
   */
  async getPumpHistory(tankId, { limit = 50 } = {}) {
    return prisma.pumpEvent.findMany({
      where: { tankId: Number(tankId) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, Number(limit))),
    });
  }
}

module.exports = new PumpService();
