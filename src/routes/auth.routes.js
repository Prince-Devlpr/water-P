const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validation.middleware');

const router = express.Router();

router.post('/register', validateBody(['name', 'email', 'password']), authController.register);
router.post('/login', validateBody(['email', 'password']), authController.login);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
