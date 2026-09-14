const mqtt = require('mqtt');
const env = require('./env');

const isSecure = env.MQTT_BROKER_URL.startsWith('mqtts://') || env.MQTT_BROKER_URL.startsWith('ssl://');

const clientOptions = {
  clientId: `smartwater_backend_${Math.random().toString(16).substring(2, 8)}`,
  clean: true,
  connectTimeout: 30000,
  reconnectPeriod: 5000,
  keepalive: 60,
};

if (env.MQTT_USERNAME) {
  clientOptions.username = env.MQTT_USERNAME;
}
if (env.MQTT_PASSWORD) {
  clientOptions.password = env.MQTT_PASSWORD;
}

if (isSecure) {
  // HiveMQ Cloud TLS configuration
  clientOptions.rejectUnauthorized = true;
}

const mqttClient = mqtt.connect(env.MQTT_BROKER_URL, clientOptions);

mqttClient.on('connect', () => {
  console.log(`✅ Connected to MQTT Broker: ${env.MQTT_BROKER_URL} (TLS: ${isSecure})`);
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Client Error:', err.message);
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT Broker...');
});

mqttClient.on('close', () => {
  // connection closed
});

function isMqttConnected() {
  return mqttClient.connected;
}

module.exports = {
  mqttClient,
  isMqttConnected,
};
