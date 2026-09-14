/**
 * Embedded Aedes MQTT Broker for Local Development
 * Allows running and testing the full backend locally without installing Mosquitto!
 */
const aedes = require('aedes')();
const net = require('net');

const PORT = 1883;
const server = net.createServer(aedes.handle);

server.listen(PORT, function () {
  console.log(`
┌────────────────────────────────────────────────────────┐
│  📡 Local MQTT Development Broker Started              │
│  Port: ${PORT}                                            │
│  Ready for ESP8266 simulator and Node.js backend       │
└────────────────────────────────────────────────────────┘
`);
});

aedes.on('client', function (client) {
  console.log(`[Broker] Client connected: ${client ? client.id : client}`);
});

aedes.on('clientDisconnect', function (client) {
  console.log(`[Broker] Client disconnected: ${client ? client.id : client}`);
});

aedes.on('publish', function (packet, client) {
  if (client) {
    // Only log application messages, omit internal $SYS topics
    if (!packet.topic.startsWith('$SYS/')) {
      console.log(`[Broker] Topic: ${packet.topic} -> ${packet.payload.toString()}`);
    }
  }
});
