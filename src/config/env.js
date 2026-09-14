require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || '*',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/smartwater?sslmode=disable',

  // MQTT / HiveMQ Cloud
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  MQTT_USERNAME: process.env.MQTT_USERNAME || '',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || '',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || 'smartwater_jwt_secret_dev_key_12345',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};

// Friendly warning for production
if (env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'smartwater_jwt_secret_dev_key_12345') {
    console.warn('⚠️ WARNING: Using default JWT_SECRET in production! Set a secure JWT_SECRET environment variable.');
  }
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ WARNING: DATABASE_URL is not explicitly configured!');
  }
}

module.exports = env;
