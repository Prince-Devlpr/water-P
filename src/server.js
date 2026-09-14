const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { initSocket } = require('./sockets/socket');
const mqttService = require('./services/mqtt.service');
const { mqttClient } = require('./config/mqtt');
const { prisma } = require('./config/database');

const server = http.createServer(app);

// 1. Initialize Real-Time WebSockets
initSocket(server);

// 2. Initialize MQTT Service Subscriptions
mqttService.init();

// 3. Start Listening (Render binds process.env.PORT automatically)
server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`
🚀 Smart Water Management Backend is running!
📡 Environment:  ${env.NODE_ENV}
🌐 HTTP/Socket:  http://0.0.0.0:${env.PORT}
🔍 Health check: http://0.0.0.0:${env.PORT}/health
  `);
});

/**
 * Graceful Shutdown Handling (Essential for Render deploys)
 */
async function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('🔒 HTTP/Socket server closed.');

    // End MQTT connection
    mqttClient.end(false, () => {
      console.log('📡 MQTT connection terminated.');
    });

    // Disconnect Prisma
    try {
      await prisma.$disconnect();
      console.log('🗄️ Database disconnected.');
    } catch (err) {
      console.error('Error disconnecting database:', err.message);
    }

    console.log('👋 Shutdown complete. Exiting.');
    process.exit(0);
  });

  // Force close if taking longer than 10 seconds
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
