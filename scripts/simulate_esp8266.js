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
const DEVICE_ID = process.env.SIMULATE_DEVICE_ID || 'ESP32_001';

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
let currentDistanceCm = 5.0; // Starts at ~55% full (with 11cm depth)
let pumpRelayState = false;  // false = OFF, true = ON
let autoModeState = true;    // true = AUTO, false = MANUAL
let totalLitersPumped = 15.0;
let flowRateLMin = 0.0;
let startTime = Date.now();

const TELEMETRY_TOPIC = `smartwater/${DEVICE_ID}/telemetry`;
const STATUS_TOPIC = `smartwater/${DEVICE_ID}/status`;
const COMMAND_PUMP_TOPIC = `smartwater/${DEVICE_ID}/command/pump`;
const COMMAND_MODE_TOPIC = `smartwater/${DEVICE_ID}/command/mode`;

client.on('connect', () => {
  console.log(`
✅ [ESP Hardware Simulator Online]
   Device ID:       ${DEVICE_ID}
   Publishing to:   ${TELEMETRY_TOPIC}
   Subscribed to:   ${COMMAND_PUMP_TOPIC}, ${COMMAND_MODE_TOPIC}
  `);

  client.subscribe([COMMAND_PUMP_TOPIC, COMMAND_MODE_TOPIC], { qos: 1 }, (err) => {
    if (err) console.error('Subscription error:', err);
  });

  publishStatus();
});

client.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === COMMAND_PUMP_TOPIC) {
      console.log(`⚡ [ESP Hardware] Remote pump command: ${JSON.stringify(data)}`);
      autoModeState = false; // manual override
      pumpRelayState = data.state === 'ON';
      flowRateLMin = pumpRelayState ? Number((1.5 + Math.random() * 0.8).toFixed(2)) : 0.0;
      publishTelemetry();
    } else if (topic === COMMAND_MODE_TOPIC) {
      console.log(`🔄 [ESP Hardware] Mode command: ${JSON.stringify(data)}`);
      autoModeState = data.mode === 'AUTO';
      publishTelemetry();
    }
  } catch (e) {
    console.error('Failed to parse command payload:', e.message);
  }
});

// Telemetry loop: every 3 seconds
setInterval(() => {
  if (!client.connected) return;

  // Simulate water physics with 11cm depth tank:
  // Tank Depth: 11cm. Full: ~1.1cm (90%). Low: ~7.7cm (30%).
  if (pumpRelayState) {
    flowRateLMin = Number((1.6 + Math.random() * 0.6).toFixed(2));
    totalLitersPumped += Number(((flowRateLMin / 60) * 3).toFixed(2));
    currentDistanceCm -= 0.5; // filling up

    if (autoModeState && currentDistanceCm <= 1.1) {
      currentDistanceCm = 1.1;
      pumpRelayState = false;
      flowRateLMin = 0.0;
      console.log('💧 [ESP Local Auto] Water reached FULL (90%). Pump stopped.');
    }
  } else {
    flowRateLMin = 0.0;
    currentDistanceCm += 0.2; // consuming water

    if (autoModeState && currentDistanceCm >= 7.7) {
      pumpRelayState = true;
      flowRateLMin = Number((1.6 + Math.random() * 0.6).toFixed(2));
      console.log('⚠️ [ESP Local Auto] Water dropped to LOW (30%). Pump started.');
    }
  }

  publishTelemetry();
}, 3000);

// Status heartbeat: every 30 seconds
setInterval(() => {
  if (client.connected) {
    publishStatus();
  }
}, 30000);

function publishTelemetry() {
  const depth = 11.0;
  const levelPercent = Math.max(0, Math.min(100, ((depth - currentDistanceCm) / depth) * 100));
  const tdsPPM = Math.floor(200 + Math.random() * 31); // 200-230 ppm

  const payload = {
    deviceId: DEVICE_ID,
    distance: Number(currentDistanceCm.toFixed(1)),
    waterLevel: Number(levelPercent.toFixed(1)),
    flowRate: flowRateLMin,
    totalLiters: Number(totalLitersPumped.toFixed(2)),
    tds: tdsPPM,
    pump: pumpRelayState,
    mode: autoModeState ? 'AUTO' : 'MANUAL',
  };

  client.publish(TELEMETRY_TOPIC, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (!err) {
      console.log(`📤 Telemetry: dist=${payload.distance}cm (${payload.waterLevel}%), flow=${payload.flowRate}L/m, total=${payload.totalLiters}L, tds=${payload.tds}ppm, pump=${payload.pump ? 'ON' : 'OFF'}, mode=${payload.mode}`);
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
