const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { prisma } = require('../config/database');

/**
 * Authentication Middleware: Verifies JWT token and attaches user to request
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Missing or malformed token.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found. Token is no longer valid.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token has expired.' });
    }
    return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
  }
}

module.exports = {
  authenticate,
};
