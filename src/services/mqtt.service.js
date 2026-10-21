const { mqttClient } = require('../config/mqtt');
const { MQTT_TOPICS } = require('../utils/constants');
const sensorService = require('./sensor.service');
const { emitDeviceStatus } = require('../sockets/socket');

class MqttService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initializes MQTT topic subscriptions and sets up message handlers.
   */
  init() {
    if (this.initialized) return;

    mqttClient.on('connect', () => {
      // Subscribe to all device telemetry, status, ack, and alert topics
      const topics = [
        MQTT_TOPICS.ALL_TELEMETRY,
        MQTT_TOPICS.ALL_STATUS,
        MQTT_TOPICS.ALL_ACK,
        MQTT_TOPICS.ALL_ALERT,
      ];

      mqttClient.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ MQTT Subscription error:', err.message);
        } else {
          console.log(`📡 Subscribed to MQTT topics: ${topics.join(', ')}`);
        }
      });
    });

    mqttClient.on('message', async (topic, messageBuffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const payload = JSON.parse(messageStr);

        await this.handleIncomingMessage(topic, payload);
      } catch (err) {
        console.error(`❌ Failed to parse/process MQTT message on [${topic}]:`, err.message);
      }
    });

    this.initialized = true;
  }

  /**
   * Routes incoming MQTT messages based on topic structure:
   * smartwater/{deviceId}/telemetry
   * smartwater/{deviceId}/status
   * smartwater/{deviceId}/ack
   * smartwater/{deviceId}/alert
   *
   * @param {string} topic
   * @param {Object} payload
   */
  async handleIncomingMessage(topic, payload) {
    const parts = topic.split('/');
    if (parts.length < 3 || parts[0] !== MQTT_TOPICS.BASE_PREFIX) {
      return;
    }

    const deviceId = parts[1];
    const messageType = parts[2];

    if (messageType === 'telemetry') {
      await sensorService.recordReading(deviceId, payload);
    } else if (messageType === 'status') {
      console.log(`📶 Device status update [${deviceId}]:`, payload);
      emitDeviceStatus(deviceId, payload);
    } else if (messageType === 'ack') {
      console.log(`✅ Device ACK received [${deviceId}]:`, payload);
    } else if (messageType === 'alert') {
      console.log(`🚨 Hardware Alert from [${deviceId}]:`, payload);
      const { emitAlert } = require('../sockets/socket');
      emitAlert(deviceId, payload);
    }
  }

  /**
   * Publishes a pump command to a specific device
   *
   * @param {string} deviceId
   * @param {'ON'|'OFF'} state
   */
  publishPumpCommand(deviceId, state) {
    const topic = MQTT_TOPICS.COMMAND(deviceId);
    const subTopic = MQTT_TOPICS.COMMAND_PUMP(deviceId);
    const payload = JSON.stringify({ command: state, state });

    return new Promise((resolve, reject) => {
      mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) return reject(err);
        mqttClient.publish(subTopic, payload, { qos: 1 });
        resolve();
      });
    });
  }
}

module.exports = new MqttService();
