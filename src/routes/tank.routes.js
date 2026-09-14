const express = require('express');
const tankController = require('../controllers/tank.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validation.middleware');

const router = express.Router();

// Tank CRUD and current status
router.post('/', authenticate, validateBody(['name', 'deviceId']), tankController.createTank);
router.get('/', authenticate, tankController.getTanks);
router.get('/:id', authenticate, tankController.getTankById);
router.put('/:id', authenticate, tankController.updateTank);
router.get('/:id/current', authenticate, tankController.getCurrentStatus);

module.exports = router;
