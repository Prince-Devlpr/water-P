const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/:id/analytics/daily', authenticate, analyticsController.getDaily);
router.get('/:id/analytics/weekly', authenticate, analyticsController.getWeekly);
router.get('/:id/analytics/monthly', authenticate, analyticsController.getMonthly);

module.exports = router;
