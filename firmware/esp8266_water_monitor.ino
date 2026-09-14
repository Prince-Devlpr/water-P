/*
 * =================================================================================
 * SMART WATER LEVEL MONITORING & PUMP CONTROLLER
 * Hardware: ESP8266 (NodeMCU / Wemos D1 Mini)
 * Sensors:  HC-SR04 Ultrasonic Sensor
 * Actuators: 5V Relay Module (Pump Control)
 * Cloud:    HiveMQ Cloud Free Cluster (MQTTS TLS Port 8883)
 *
 * KEY FEATURES:
 * 1. Offline Failsafe Automatic Pump Control (Hysteresis):
 *    Even if Wi-Fi or MQTT disconnects, the ESP8266 continues to read water
 *    levels and turn the pump ON below LOW_THRESHOLD and OFF at FULL_THRESHOLD.
 * 2. HiveMQ Cloud TLS 8883 Support with WiFiClientSecure.
 * 3. Remote manual override commands from Mobile App via MQTT.
 * 4. Periodic telemetry and heartbeat publishing.
 * =================================================================================
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h> // ArduinoJson v6 or v7

// ---------------------------------------------------------------------------------
// 1. PIN CONFIGURATIONS
// ---------------------------------------------------------------------------------
#define TRIG_PIN     5  // D1 (GPIO 5) -> HC-SR04 TRIG
#define ECHO_PIN     4  // D2 (GPIO 4) -> HC-SR04 ECHO
#define RELAY_PIN   14  // D5 (GPIO 14) -> Relay Control Pin (Active LOW or HIGH)
#define STATUS_LED   2  // D4 (GPIO 2) -> Built-in LED (Active LOW on ESP8266)

// Relay Logic (Most relay boards are Active LOW; set to true if Active LOW)
const bool RELAY_ACTIVE_LOW = true;

// ---------------------------------------------------------------------------------
// 2. NETWORK & HIVEMQ CLOUD CREDENTIALS
// ---------------------------------------------------------------------------------
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";

// HiveMQ Cloud Host
const char* MQTT_BROKER     = "510e54d0e9f3499dbcf82e32c834cb8d.s1.eu.hivemq.cloud";
const int   MQTT_PORT       = 8883; // Secure TLS port for HiveMQ Cloud
const char* MQTT_USERNAME   = "prince";
const char* MQTT_PASSWORD   = "prince@33";

const char* DEVICE_ID       = "ESP8266_001";

// MQTT Topics
String topicTelemetry = String("smartwater/") + DEVICE_ID + "/telemetry";
String topicStatus    = String("smartwater/") + DEVICE_ID + "/status";
String topicCommand   = String("smartwater/") + DEVICE_ID + "/command/pump";

// ---------------------------------------------------------------------------------
// 3. TANK DIMENSIONS & LOCAL FAILSAFE THRESHOLDS
// ---------------------------------------------------------------------------------
const float TANK_DEPTH_CM     = 100.0; // Total height of tank
const float LOW_THRESHOLD_PCT = 20.0;  // Turn pump ON when water level <= 20%
const float FULL_THRESHOLD_PCT= 90.0;  // Turn pump OFF when water level >= 90%

// ---------------------------------------------------------------------------------
// 4. CLIENTS & TIMING
// ---------------------------------------------------------------------------------
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryTime = 0;
unsigned long lastStatusTime    = 0;
const unsigned long TELEMETRY_INTERVAL = 5000;  // Send telemetry every 5s
const unsigned long STATUS_INTERVAL    = 30000; // Send heartbeat status every 30s

bool pumpState = false; // Current pump relay state (false = OFF, true = ON)

// ---------------------------------------------------------------------------------
// HELPER: Measure Distance using Ultrasonic Sensor
// ---------------------------------------------------------------------------------
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Measure pulse duration (timeout after 30ms ~ 5 meters)
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) {
    return -1.0; // Sensor timeout or reading error
  }

  // Speed of sound: 343 m/s = 0.0343 cm/microsecond
  // distance = (duration / 2) * 0.0343
  float distance = (duration * 0.0343) / 2.0;
  return distance;
}

// ---------------------------------------------------------------------------------
// HELPER: Set Pump Relay State
// ---------------------------------------------------------------------------------
void setRelay(bool turnOn) {
  pumpState = turnOn;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, turnOn ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  }
}

// ---------------------------------------------------------------------------------
// LOCAL FAILSAFE HYSTERESIS: Autonomous Control without Internet
// ---------------------------------------------------------------------------------
void evaluateLocalHysteresis(float distanceCm) {
  if (distanceCm < 0) return; // Invalid reading, skip

  // Calculate local water level percentage
  float waterHeight = TANK_DEPTH_CM - distanceCm;
  float levelPercent = (waterHeight / TANK_DEPTH_CM) * 100.0;
  if (levelPercent < 0) levelPercent = 0;
  if (levelPercent > 100) levelPercent = 100;

  // Hysteresis logic
  if (!pumpState && levelPercent <= LOW_THRESHOLD_PCT) {
    // Water level is low -> Turn ON pump automatically
    Serial.printf("[AUTO-FAILSAFE] Low level detected (%.1f%%). Starting Pump.\n", levelPercent);
    setRelay(true);
  } else if (pumpState && levelPercent >= FULL_THRESHOLD_PCT) {
    // Tank is full -> Turn OFF pump automatically
    Serial.printf("[AUTO-FAILSAFE] Full level reached (%.1f%%). Stopping Pump.\n", levelPercent);
    setRelay(false);
  }
}

// ---------------------------------------------------------------------------------
// MQTT CALLBACK: Handle Remote Commands from Backend / App
// ---------------------------------------------------------------------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("[MQTT COMMAND] Topic: %s -> %s\n", topic, message.c_str());

  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    const char* state = doc["state"];
    if (state != NULL) {
      if (strcmp(state, "ON") == 0) {
        Serial.println("[REMOTE OVERRIDE] Switching Pump ON");
        setRelay(true);
      } else if (strcmp(state, "OFF") == 0) {
        Serial.println("[REMOTE OVERRIDE] Switching Pump OFF");
        setRelay(false);
      }
    }
  }
}

// ---------------------------------------------------------------------------------
// WI-FI & MQTT RECONNECT
// ---------------------------------------------------------------------------------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED)); // Blink while connecting
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected! IP: " + WiFi.localIP().toString());
    digitalWrite(STATUS_LED, LOW); // Solid ON when connected
  } else {
    Serial.println("\n[Wi-Fi] Connection timed out. Running in offline autonomous mode.");
  }
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;

  Serial.print("[MQTT] Connecting to HiveMQ Cloud... ");
  String clientId = String("ESP8266_") + String(random(0xffff), HEX);

  if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.println("CONNECTED!");
    // Subscribe to pump control commands
    mqttClient.subscribe(topicCommand.c_str());
    Serial.printf("[MQTT] Subscribed to %s\n", topicCommand.c_str());

    // Publish online status immediately
    publishStatus();
  } else {
    Serial.printf("FAILED (rc=%d). Will retry later.\n", mqttClient.state());
  }
}

// ---------------------------------------------------------------------------------
// PUBLISH DATA
// ---------------------------------------------------------------------------------
void publishTelemetry(float distanceCm) {
  if (!mqttClient.connected() || distanceCm < 0) return;

  StaticJsonDocument<200> doc;
  doc["distance"] = serialized(String(distanceCm, 1));
  doc["pump"]     = pumpState;

  char buffer[256];
  serializeJson(doc, buffer);

  mqttClient.publish(topicTelemetry.c_str(), buffer);
  Serial.printf("[MQTT TELEMETRY] Sent: %s\n", buffer);
}

void publishStatus() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<200> doc;
  doc["online"]     = true;
  doc["wifiSignal"] = WiFi.RSSI();
  doc["uptime"]     = millis() / 1000;

  char buffer[256];
  serializeJson(doc, buffer);

  mqttClient.publish(topicStatus.c_str(), buffer);
  Serial.printf("[MQTT STATUS] Sent: %s\n", buffer);
}

// ---------------------------------------------------------------------------------
// ARDUINO SETUP & LOOP
// ---------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Smart Water Monitor Starting ===");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  // Initialize relay to OFF
  setRelay(false);

  // Configure TLS connection for HiveMQ Cloud
  // Insecure mode is used on ESP8266 to avoid RAM exhaustion with complex X.509 chains
  espClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(512);

  connectWiFi();
  connectMQTT();
}

void loop() {
  // Maintain Wi-Fi and MQTT connection in background
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      connectMQTT();
    } else {
      mqttClient.loop();
    }
  } else {
    // Periodically attempt Wi-Fi reconnection without blocking pump safety
    static unsigned long lastWifiAttempt = 0;
    if (millis() - lastWifiAttempt > 20000) {
      lastWifiAttempt = millis();
      connectWiFi();
    }
  }

  // 1. ALWAYS perform ultrasonic reading and local hysteresis failsafe
  unsigned long now = millis();
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL) {
    lastTelemetryTime = now;

    float distance = readDistanceCm();
    if (distance > 0) {
      Serial.printf("[SENSOR] Distance: %.1f cm\n", distance);

      // CRITICAL: Local failsafe automatic pump control
      evaluateLocalHysteresis(distance);

      // If connected to cloud, publish telemetry
      publishTelemetry(distance);
    } else {
      Serial.println("[SENSOR ERROR] Failed to get valid ultrasonic distance");
    }
  }

  // 2. Periodic heartbeat status
  if (now - lastStatusTime >= STATUS_INTERVAL) {
    lastStatusTime = now;
    publishStatus();
  }
}
