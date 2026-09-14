const express = require('express');
const pumpController = require('../controllers/pump.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Remote pump commands and history
router.post('/:id/pump/on', authenticate, pumpController.turnPumpOn);
router.post('/:id/pump/off', authenticate, pumpController.turnPumpOff);
router.get('/:id/pump/history', authenticate, pumpController.getHistory);

module.exports = router;
