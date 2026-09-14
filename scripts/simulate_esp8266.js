/**
 * ESP8266 + Ultrasonic Sensor + Pump Relay Hardware Simulator
 *
 * Simulates:
 * 1. HC-SR04 continuous distance measurement
 * 2. Automatic failsafe pump relay control (hysteresis)
 * 3. Listening for remote app pump commands via MQTT
 * 4. Periodic telemetry and heartbeat status publishing
 */
const mqtt = require('mqtt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const USERNAME = process.env.MQTT_USERNAME || '';
const PASSWORD = process.env.MQTT_PASSWORD || '';
const DEVICE_ID = process.env.SIMULATE_DEVICE_ID || 'ESP8266_001';

const isSecure = BROKER_URL.startsWith('mqtts://') || BROKER_URL.startsWith('ssl://');

const clientOptions = {
  clientId: `esp8266_simulator_${Math.random().toString(16).substring(2, 8)}`,
  clean: true,
  connectTimeout: 20000,
};

if (USERNAME) clientOptions.username = USERNAME;
if (PASSWORD) clientOptions.password = PASSWORD;
if (isSecure) clientOptions.rejectUnauthorized = true;

console.log(`🔌 Connecting ESP8266 simulator to: ${BROKER_URL}`);
const client = mqtt.connect(BROKER_URL, clientOptions);

// Simulated Hardware State
let currentDistanceCm = 45.0; // Starts at ~55% full (assuming 100cm depth)
let pumpRelayState = false;   // false = OFF, true = ON
let startTime = Date.now();

const TELEMETRY_TOPIC = `smartwater/${DEVICE_ID}/telemetry`;
const STATUS_TOPIC = `smartwater/${DEVICE_ID}/status`;
const COMMAND_TOPIC = `smartwater/${DEVICE_ID}/command/pump`;

client.on('connect', () => {
  console.log(`
✅ [ESP8266 Simulator Online]
   Device ID:       ${DEVICE_ID}
   Publishing to:   ${TELEMETRY_TOPIC}
   Subscribed to:   ${COMMAND_TOPIC}
  `);

  // Subscribe to pump commands from backend/app
  client.subscribe(COMMAND_TOPIC, { qos: 1 }, (err) => {
    if (err) console.error('Subscription error:', err);
  });

  // Initial Status publish
  publishStatus();
});

client.on('message', (topic, message) => {
  if (topic === COMMAND_TOPIC) {
    try {
      const data = JSON.parse(message.toString());
      console.log(`⚡ [ESP8266 Hardware] Received remote pump command: ${JSON.stringify(data)}`);

      if (data.state === 'ON') {
        pumpRelayState = true;
        console.log('🔌 Relay switched: PUMP ON (Remote Override)');
      } else if (data.state === 'OFF') {
        pumpRelayState = false;
        console.log('🔌 Relay switched: PUMP OFF (Remote Override)');
      }

      // Immediate telemetry update after command
      publishTelemetry();
    } catch (e) {
      console.error('Failed to parse command payload:', e.message);
    }
  }
});

// Telemetry loop: every 4 seconds
setInterval(() => {
  if (!client.connected) return;

  // Simulate water level physics:
  // If pump is ON -> water level rises (distance decreases)
  // If pump is OFF -> water is used slowly (distance increases)
  if (pumpRelayState) {
    currentDistanceCm -= 2.5; // filling up
    if (currentDistanceCm <= 10.0) {
      // Local automatic hysteresis cutoff (Tank Full ~90%)
      currentDistanceCm = 10.0;
      pumpRelayState = false;
      console.log('💧 [ESP8266 Local Auto-Failsafe] Water reached FULL threshold (90%). Pump stopped automatically.');
    }
  } else {
    currentDistanceCm += 1.0; // consuming water
    if (currentDistanceCm >= 82.0) {
      // Local automatic hysteresis start (Tank Low ~18%)
      pumpRelayState = true;
      console.log('⚠️ [ESP8266 Local Auto-Failsafe] Water dropped to LOW threshold (18%). Pump started automatically.');
    }
  }

  publishTelemetry();
}, 4000);

// Status heartbeat: every 30 seconds
setInterval(() => {
  if (client.connected) {
    publishStatus();
  }
}, 30000);

function publishTelemetry() {
  const payload = {
    distance: Number(currentDistanceCm.toFixed(1)),
    pump: pumpRelayState,
  };

  client.publish(TELEMETRY_TOPIC, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (!err) {
      console.log(`📤 Telemetry published: distance=${payload.distance}cm, pump=${payload.pump ? 'ON' : 'OFF'}`);
    }
  });
}

function publishStatus() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const payload = {
    online: true,
    wifiSignal: -64 + Math.floor(Math.random() * 5),
    uptime: uptimeSeconds,
  };

  client.publish(STATUS_TOPIC, JSON.stringify(payload), { qos: 1 });
}

client.on('error', (err) => {
  console.error('MQTT Simulator error:', err.message);
});
