const express = require('express');
const { mqttClient } = require('../config/mqtt');
const { prisma } = require('../config/database');
const { MQTT_TOPICS, PUMP_SOURCES, PUMP_REASONS } = require('../utils/constants');
const { emitPumpEvent, emitModeChange } = require('../sockets/socket');
const { optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * POST /api/device/command
 * Body: { command: "ON" | "OFF" | "AUTO" | "MANUAL", deviceId?: string }
 *
 * Publishes pump command to HiveMQ topic: smartwater/{deviceId}/command
 */
router.post('/command', optionalAuth, (req, res) => {
  const command = String(req.body.command || '').toUpperCase();
  const deviceId = req.body.deviceId || 'ESP32_001';

  if (!['ON', 'OFF', 'AUTO', 'MANUAL'].includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  if (!mqttClient.connected) {
    return res.status(503).json({ error: 'MQTT unavailable' });
  }

  const topic = `smartwater/${deviceId}/command`;
  const payload = JSON.stringify({
    command,
    state: command,
    mode: command,
  });

  mqttClient.publish(topic, payload, { qos: 1 }, async (err) => {
    if (err) {
      console.error(`❌ Publish failed to ${topic}:`, err.message);
      return res.status(502).json({ error: 'Publish failed' });
    }

    console.log(`📤 Dispatched command [${command}] to ${topic}`);

    // Mirror to specific subtopics for firmware backward compatibility
    if (command === 'ON' || command === 'OFF') {
      mqttClient.publish(MQTT_TOPICS.COMMAND_PUMP(deviceId), payload, { qos: 1 });
    } else {
      mqttClient.publish(MQTT_TOPICS.COMMAND_MODE(deviceId), payload, { qos: 1 });
    }

    // Persist event in DB if tank registered
    try {
      const tank = await prisma.tank.findUnique({ where: { deviceId } });
      if (tank) {
        if (command === 'ON' || command === 'OFF') {
          await prisma.tank.update({
            where: { id: tank.id },
            data: { autoMode: false },
          });
          const event = await prisma.pumpEvent.create({
            data: {
              tankId: tank.id,
              status: command,
              reason: PUMP_REASONS.USER_COMMAND,
              source: PUMP_SOURCES.APP,
            },
          });
          emitPumpEvent(tank.id, event);
        } else if (command === 'AUTO' || command === 'MANUAL') {
          const isAuto = command === 'AUTO';
          await prisma.tank.update({
            where: { id: tank.id },
            data: { autoMode: isAuto },
          });
          emitModeChange(tank.id, command);
        }
      }
    } catch (dbErr) {
      console.warn('Database sync warning on device command:', dbErr.message);
    }

    res.json({
      success: true,
      deviceId,
      command,
      timestamp: new Date().toISOString(),
    });
  });
});

module.exports = router;
