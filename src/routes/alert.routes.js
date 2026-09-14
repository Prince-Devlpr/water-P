const express = require('express');
const alertController = require('../controllers/alert.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Tank-scoped alerts
router.get('/tanks/:id/alerts', authenticate, alertController.getAlerts);

// Direct alert actions
router.put('/alerts/:id/read', authenticate, alertController.markAsRead);
router.put('/alerts/read-all', authenticate, alertController.markAllAsRead);

module.exports = router;
