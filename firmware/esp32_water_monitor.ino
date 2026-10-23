#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ========== WIFI: ENTER YOUR CREDENTIALS ==========
const char* WIFI_SSID = "Prince’s iPhone";
const char* WIFI_PASSWORD = "pr111111";

// ========== HIVEMQ CLOUD ==========
const char* MQTT_HOST = "510e54d0e9f3499dbcf82e32c834cb8d.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USER = "prince";
const char* MQTT_PASSWORD = "prince@33";

// ========== DEVICE / TOPICS ==========
const char* DEVICE_ID = "ESP32_001";

char telemetryTopic[80];
char statusTopic[80];
char commandTopic[80];
char ackTopic[80];
char alertTopic[80]; // <-- Added: Hardware alert notification topic

// ========== PINS ==========
#define TRIG_PIN 5
#define ECHO_PIN 18
#define FLOW_PIN 27
#define RELAY_PIN 26
#define BUZZER_PIN 25

// ========== LCD ==========
#define LCD_ADDRESS 0x27
LiquidCrystal_I2C lcd(LCD_ADDRESS, 16, 2);

// ========== TANK SETTINGS (DYNAMICALLY CALIBRATED) ==========
float TANK_DEPTH_CM = 11.0;
float LOW_LEVEL = 50.0;
float FULL_LEVEL = 70.0;
const bool RELAY_ACTIVE_LOW = true;

// ========== FLOW SENSOR ==========
const float PULSES_PER_LITER = 450.0;
volatile unsigned long flowPulses = 0;
unsigned long lastFlowMillis = 0;
float flowRateLMin = 0;
float totalLiters = 0;

// ========== SENSOR VALUES ==========
float distanceCm = -1;
float waterLevel = 0;
int tdsPPM = 220;

// ========== CONTROL ==========
bool pumpOn = false;
bool autoMode = true;
bool buzzerState = false;

unsigned long lastTdsUpdate = 0;
unsigned long lastScreenChange = 0;
unsigned long lastPublish = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastBuzzerToggle = 0;
unsigned long lastAlertPublish = 0;

bool showScreenOne = true;

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

// Forward declarations
void publishTelemetry();
void publishAlert(const char* type, const char* message);

// ========== FLOW INTERRUPT ==========
void IRAM_ATTR countFlowPulse() {
  flowPulses++;
}

// ========== PUMP ==========
void setPump(bool on, const char* reason) {
  if (pumpOn == on) return;

  pumpOn = on;

  digitalWrite(
    RELAY_PIN,
    RELAY_ACTIVE_LOW
      ? (on ? LOW : HIGH)
      : (on ? HIGH : LOW)
  );

  Serial.printf("⚡ Pump: %s | %s\n",
                on ? "ON" : "OFF", reason);

  // Immediately notify app of state change
  if (mqtt.connected()) {
    publishTelemetry();
  }
}

// ========== DISTANCE ==========
float readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) return -1;

  float cm = duration * 0.0343 / 2.0;

  if (cm < 2.0 || cm > 400.0) return -1;

  return cm;
}

void updateWaterLevel() {
  float measured = readDistance();

  if (measured < 0) {
    distanceCm = -1;

    // Fail-safe: stop automatic pumping if the sensor fails.
    if (autoMode) {
      setPump(false, "Invalid ultrasonic reading");
    }
    return;
  }

  distanceCm = measured;
  waterLevel = ((TANK_DEPTH_CM - distanceCm)
                / TANK_DEPTH_CM) * 100.0;

  waterLevel = constrain(waterLevel, 0.0, 100.0);
}

// ========== AUTOMATIC PUMP ==========
void updatePumpControl() {
  if (!autoMode || distanceCm < 0) return;

  if (waterLevel <= LOW_LEVEL) {
    setPump(true, "Water level <= 50%");
  } else if (waterLevel >= FULL_LEVEL) {
    setPump(false, "Water level >= 70%");
  }
}

// ========== RANDOM TDS FOR TESTING ==========
void updateTDS() {
  if (millis() - lastTdsUpdate >= 3000) {
    lastTdsUpdate = millis();
    tdsPPM = random(200, 231);
  }
}

// ========== FLOW RATE ==========
void updateFlow() {
  unsigned long now = millis();

  if (now - lastFlowMillis >= 1000) {
    noInterrupts();
    unsigned long pulses = flowPulses;
    flowPulses = 0;
    interrupts();

    float elapsed = (now - lastFlowMillis) / 1000.0;
    lastFlowMillis = now;

    float liters = pulses / PULSES_PER_LITER;

    flowRateLMin = elapsed > 0
        ? liters * 60.0 / elapsed
        : 0.0;

    totalLiters += liters;
  }
}

// ========== BUZZER & ALERT DISPATCH ==========
void updateBuzzer() {
  bool alarm = distanceCm >= 0 &&
      (waterLevel <= LOW_LEVEL || waterLevel >= FULL_LEVEL);

  if (tdsPPM > 500) alarm = true;

  if (alarm) {
    if (millis() - lastBuzzerToggle >= 300) {
      lastBuzzerToggle = millis();
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }

    // Rate-limited alert publishing (once every 15 seconds)
    if (millis() - lastAlertPublish > 15000) {
      lastAlertPublish = millis();
      if (waterLevel <= LOW_LEVEL) {
        publishAlert("LOW_LEVEL", "Tank water level is low (<= 50%)");
      } else if (waterLevel >= FULL_LEVEL) {
        publishAlert("TANK_FULL", "Tank is full (>= 70%)");
      } else if (tdsPPM > 500) {
        publishAlert("HIGH_TDS", "Water TDS exceeded 500 ppm safe threshold");
      }
    }
  } else {
    buzzerState = false;
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// ========== LCD ==========
void updateLCD() {
  if (millis() - lastScreenChange >= 2500) {
    lastScreenChange = millis();
    showScreenOne = !showScreenOne;
    lcd.clear();
  }

  if (showScreenOne) {
    lcd.setCursor(0, 0);

    if (distanceCm < 0) {
      lcd.print("Dist: Error     ");
    } else {
      lcd.print("Dist:");
      lcd.print(distanceCm, 1);
      lcd.print("cm       ");
    }

    lcd.setCursor(0, 1);
    lcd.print("Lvl:");
    lcd.print((int)waterLevel);
    lcd.print("% Pump:");
    lcd.print(pumpOn ? "ON " : "OFF");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Flow:");
    lcd.print(flowRateLMin, 1);
    lcd.print(" L/min   ");

    lcd.setCursor(0, 1);
    lcd.print("TDS:");
    lcd.print(tdsPPM);
    lcd.print(" ppm       ");
  }
}

// ========== MQTT COMMAND HANDLER ==========
// Supports:
//   {"command":"ON"}     or {"state":"ON"}
//   {"command":"OFF"}    or {"state":"OFF"}
//   {"command":"AUTO"}   or {"mode":"AUTO"}
//   {"command":"MANUAL"} or {"mode":"MANUAL"}
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("📥 MQTT command on %s: %s\n", topic, message.c_str());

  if (message.indexOf("\"command\":\"ON\"") >= 0 || message.indexOf("\"state\":\"ON\"") >= 0) {
    autoMode = false;
    setPump(true, "MQTT manual ON");
  } else if (message.indexOf("\"command\":\"OFF\"") >= 0 || message.indexOf("\"state\":\"OFF\"") >= 0) {
    autoMode = false;
    setPump(false, "MQTT manual OFF");
  } else if (message.indexOf("\"command\":\"AUTO\"") >= 0 || message.indexOf("\"mode\":\"AUTO\"") >= 0) {
    autoMode = true;
    Serial.println("🔄 Automatic mode enabled by MQTT");
  } else if (message.indexOf("\"command\":\"MANUAL\"") >= 0 || message.indexOf("\"mode\":\"MANUAL\"") >= 0) {
    autoMode = false;
    setPump(false, "🔄 MQTT manual mode selected");
  } else if (message.indexOf("\"command\":\"CONFIG\"") >= 0 || message.indexOf("tankDepthCm") >= 0) {
    int depthIdx = message.indexOf("\"tankDepthCm\":");
    if (depthIdx >= 0) {
      TANK_DEPTH_CM = message.substring(depthIdx + 14).toFloat();
      Serial.printf("📏 Calibration updated: Tank Depth = %.1f cm\n", TANK_DEPTH_CM);
    }
    int lowIdx = message.indexOf("\"lowThreshold\":");
    if (lowIdx >= 0) {
      LOW_LEVEL = message.substring(lowIdx + 15).toFloat();
      Serial.printf("📉 Threshold updated: Low Level = %.1f%%\n", LOW_LEVEL);
    }
    int highIdx = message.indexOf("\"fullThreshold\":");
    if (highIdx >= 0) {
      FULL_LEVEL = message.substring(highIdx + 16).toFloat();
      Serial.printf("📈 Threshold updated: Full Level = %.1f%%\n", FULL_LEVEL);
    }
    if (message.indexOf("\"autoMode\":true") >= 0) {
      autoMode = true;
    } else if (message.indexOf("\"autoMode\":false") >= 0) {
      autoMode = false;
    }
    Serial.println("⚙️ Dynamic calibration parameters updated from App via MQTT!");
  }

  if (mqtt.connected()) {
    char ack[180];
    snprintf(ack, sizeof(ack),
      "{\"deviceId\":\"%s\",\"received\":true,\"pumpOn\":%s,\"autoMode\":%s}",
      DEVICE_ID,
      pumpOn ? "true" : "false",
      autoMode ? "true" : "false");

    mqtt.publish(ackTopic, ack);
  }
}

// ========== WIFI ==========
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttempt < 10000) return;

  lastWifiAttempt = millis();
  Serial.println("Connecting to Wi-Fi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ========== MQTT (WITH LWT FOR RELIABLE OFFLINE STATUS) ==========
void ensureMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (millis() - lastMqttAttempt < 5000) return;

  lastMqttAttempt = millis();

  String clientId = String(DEVICE_ID) + "-" +
                    String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("Connecting to HiveMQ Cloud... ");

  // Connect with Last-Will-and-Testament (LWT):
  // If the ESP unexpectedly disconnects, HiveMQ automatically publishes {"online":false} to statusTopic!
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD, statusTopic, 1, true, "{\"online\":false}")) {
    Serial.println("connected ✅");

    // Subscribe to both main command topic and subtopics
    mqtt.subscribe(commandTopic);
    String commandWildcard = String("smartwater/") + DEVICE_ID + "/command/#";
    mqtt.subscribe(commandWildcard.c_str());

    // Publish active online status (retained = true)
    mqtt.publish(statusTopic, "{\"online\":true}", true);
  } else {
    Serial.printf("failed, state=%d ❌\n", mqtt.state());
  }
}

// ========== TELEMETRY ==========
void publishTelemetry() {
  if (!mqtt.connected()) return;
  if (millis() - lastPublish < 3000) return;

  lastPublish = millis();

  char payload[320];

  snprintf(payload, sizeof(payload),
    "{\"deviceId\":\"%s\","
    "\"distanceCm\":%.2f,"
    "\"waterLevel\":%.2f,"
    "\"flowRateLMin\":%.3f,"
    "\"totalLiters\":%.3f,"
    "\"tdsPPM\":%d,"
    "\"pumpStatus\":\"%s\","
    "\"autoMode\":%s}",
    DEVICE_ID,
    distanceCm,
    waterLevel,
    flowRateLMin,
    totalLiters,
    tdsPPM,
    pumpOn ? "ON" : "OFF",
    autoMode ? "true" : "false");

  if (mqtt.publish(telemetryTopic, payload)) {
    Serial.print("📤 Telemetry published: ");
    Serial.println(payload);
  } else {
    Serial.println("❌ Telemetry publish failed");
  }
}

// ========== PUBLISH HARDWARE ALERT ==========
void publishAlert(const char* type, const char* message) {
  if (!mqtt.connected()) return;

  char alertPayload[200];
  snprintf(alertPayload, sizeof(alertPayload),
    "{\"deviceId\":\"%s\",\"type\":\"%s\",\"message\":\"%s\",\"level\":%.1f,\"tds\":%d}",
    DEVICE_ID, type, message, waterLevel, tdsPPM);

  mqtt.publish(alertTopic, alertPayload);
  Serial.printf("🚨 Alert published: %s\n", alertPayload);
}

// ========== SERIAL COMMANDS ==========
void handleSerial() {
  while (Serial.available()) {
    char cmd = Serial.read();

    switch (cmd) {
      case 'A':
      case 'a':
        autoMode = true;
        Serial.println("Automatic mode enabled");
        break;

      case 'M':
      case 'm':
        autoMode = false;
        setPump(false, "Manual mode selected");
        break;

      case '1':
        autoMode = false;
        setPump(true, "Manual ON command");
        break;

      case '0':
        autoMode = false;
        setPump(false, "Manual OFF command");
        break;

      case 'T':
      case 't':
        Serial.printf("TDS: %d ppm\n", tdsPPM);
        break;

      case 'H':
      case 'h':
        Serial.println(
          "A=Auto, M=Manual, 1=Pump ON, 0=Pump OFF, T=TDS, H=Help");
        break;
    }
  }
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  randomSeed(micros());

  // Topic generation
  snprintf(telemetryTopic, sizeof(telemetryTopic),
           "smartwater/%s/telemetry", DEVICE_ID);
  snprintf(statusTopic, sizeof(statusTopic),
           "smartwater/%s/status", DEVICE_ID);
  snprintf(commandTopic, sizeof(commandTopic),
           "smartwater/%s/command", DEVICE_ID);
  snprintf(ackTopic, sizeof(ackTopic),
           "smartwater/%s/ack", DEVICE_ID);
  snprintf(alertTopic, sizeof(alertTopic),
           "smartwater/%s/alert", DEVICE_ID);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLOW_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Water");
  lcd.setCursor(0, 1);
  lcd.print("Connecting...");

  attachInterrupt(digitalPinToInterrupt(FLOW_PIN),
                  countFlowPulse, FALLING);

  lastFlowMillis = millis();
  lastScreenChange = millis();

  // Encrypt TLS traffic to HiveMQ Cloud TLS Port 8883
  secureClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);

  Serial.println("=========================================");
  Serial.println(" Smart Water Management System (ESP32)");
  Serial.println(" Wi-Fi + HiveMQ Cloud MQTT starting...");
  Serial.println("=========================================");
}

// ========== MAIN LOOP ==========
void loop() {
  ensureWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    ensureMQTT();
    mqtt.loop();
  }

  updateWaterLevel();
  updateFlow();
  updateTDS();
  updatePumpControl();
  updateBuzzer();
  updateLCD();
  publishTelemetry();
  handleSerial();

  static unsigned long lastLog = 0;
  if (millis() - lastLog >= 2000) {
    lastLog = millis();

    Serial.printf(
      "Distance: %.1f cm | Level: %.1f%% | Pump: %s | "
      "Flow: %.2f L/min | Total: %.2f L | TDS: %d ppm | MQTT: %s\n",
      distanceCm, waterLevel, pumpOn ? "ON" : "OFF",
      flowRateLMin, totalLiters, tdsPPM,
      mqtt.connected() ? "Connected" : "Disconnected");
  }

  delay(50);
}
