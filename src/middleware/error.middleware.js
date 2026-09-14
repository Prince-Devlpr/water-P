const env = require('../config/env');

/**
 * Global error handling middleware
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (env.NODE_ENV !== 'test') {
    console.error(`💥 Error [${req.method} ${req.url}]:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 Route Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
