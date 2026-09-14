const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const { checkDbConnection } = require('./config/database');
const { isMqttConnected } = require('./config/mqtt');

const authRoutes = require('./routes/auth.routes');
const tankRoutes = require('./routes/tank.routes');
const sensorRoutes = require('./routes/sensor.routes');
const pumpRoutes = require('./routes/pump.routes');
const alertRoutes = require('./routes/alert.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const app = express();

// Security & Parsing Middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN === '*' ? true : env.CLIENT_ORIGIN.split(','),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

/**
 * Render Health Check Endpoint
 * Used by Render to verify container readiness and prevent downtime.
 */
app.get('/health', async (req, res) => {
  const isDbHealthy = await checkDbConnection();
  const isMqttHealthy = isMqttConnected();

  const isHealthy = isDbHealthy; // DB is critical, MQTT may auto-reconnect

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: isDbHealthy ? 'connected' : 'disconnected',
      mqtt: isMqttHealthy ? 'connected' : 'disconnected',
    },
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tanks', tankRoutes);
app.use('/api/tanks', sensorRoutes);
app.use('/api/tanks', pumpRoutes);
app.use('/api', alertRoutes);
app.use('/api/tanks', analyticsRoutes);

// Fallback Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
