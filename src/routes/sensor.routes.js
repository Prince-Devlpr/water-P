const express = require('express');
const sensorController = require('../controllers/sensor.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// GET /api/tanks/:id/readings
router.get('/:id/readings', authenticate, sensorController.getReadings);

module.exports = router;
