const express = require('express');
const sensorController = require('../controllers/sensor.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Telemetry Ingestion from IoT Devices (ESP32 / ESP8266)
router.post('/telemetry', sensorController.postReading);
router.post('/:id/readings', sensorController.postReading);

// GET /api/tanks/:id/readings
router.get('/:id/readings', authenticate, sensorController.getReadings);

module.exports = router;
