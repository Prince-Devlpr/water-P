# Smart Water Level Management System — Backend

> **Architecture:** ESP8266 + HC-SR04 Ultrasonic Sensor → HiveMQ Cloud (TLS 8883) → Node.js / Express (Render Web Service) → PostgreSQL (Render Managed DB) → Alerts & Real-time Socket.IO → Mobile App / Dashboard

---

## 📋 Table of Contents
1. [Overview & Features](#overview--features)
2. [Project Structure](#project-structure)
3. [Environment Configuration (.env)](#environment-configuration-env)
4. [Local Development & Testing](#local-development--testing)
5. [Deploying to Render](#deploying-to-render)
6. [Connecting HiveMQ Cloud Free Cluster](#connecting-hivemq-cloud-free-cluster)
7. [ESP8266 Hardware Setup & Firmware](#esp8266-hardware-setup--firmware)
8. [REST API Documentation](#rest-api-documentation)
9. [Socket.IO Real-time Events](#socketio-real-time-events)

---

## 1. Overview & Features

- **Continuous Water Level Monitoring**: Converts ultrasonic distance ($cm$) into percentage ($0-100\%$) and volume in Liters based on customizable tank dimensions.
- **State-Change Alert Deduplication**: Automatically alerts on `CRITICAL_LOW`, `LOW_LEVEL`, and `TANK_FULL`. Prevents alert spam by only recording and broadcasting when the state changes.
- **Dual Pump Control (Manual + Autonomous Offline Failsafe)**:
  - **Local ESP8266 Automatic Failsafe**: The microcontroller independently manages relay hysteresis (PUMP ON at $\le 20\%$, PUMP OFF at $\ge 90\%$) so the pump operates even if internet or Wi-Fi drops.
  - **Remote Mobile App Control**: Manual override ON/OFF commands dispatched through MQTT.
- **Historical Time-Series & Analytics**: Aggregates hourly, daily, and weekly consumption trends and pump activation cycles.
- **Render & HiveMQ Cloud Optimized**: Ready for 1-click cloud deployment with `render.yaml` and TLS port `8883`.

---

## 2. Project Structure

```text
backend/
├── src/
│   ├── server.js                   # HTTP server, Socket.IO & graceful shutdown (SIGTERM/SIGINT)
│   ├── app.js                      # Express configuration, CORS, Helmet, routes, /health
│   │
│   ├── config/
│   │   ├── env.js                  # Environment variables validation (HiveMQ, Render DB, JWT)
│   │   ├── database.js             # Prisma client instance with connection resilience
│   │   └── mqtt.js                 # HiveMQ Cloud TLS connection options & auto-reconnect
│   │
│   ├── controllers/
│   │   ├── auth.controller.js      # Register, login, current profile
│   │   ├── tank.controller.js      # Tank CRUD, current status & summary
│   │   ├── sensor.controller.js    # Historical readings retrieval
│   │   ├── pump.controller.js      # Remote pump ON/OFF commands & event logs
│   │   ├── alert.controller.js     # Alert listings & mark-read
│   │   └── analytics.controller.js # Daily, weekly, monthly analytics
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── tank.routes.js
│   │   ├── sensor.routes.js
│   │   ├── pump.routes.js
│   │   ├── alert.routes.js
│   │   └── analytics.routes.js
│   │
│   ├── services/
│   │   ├── mqtt.service.js         # HiveMQ subscribe, publish & message routing
│   │   ├── sensor.service.js       # Process ultrasonic telemetry, update DB, broadcast
│   │   ├── waterLevel.service.js   # Ultrasonic distance to percentage & volume
│   │   ├── pump.service.js         # Pump command safety checks & event logging
│   │   ├── alert.service.js        # Threshold evaluation & state-change alert deduplication
│   │   └── analytics.service.js    # Time-series aggregation & consumption statistics
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification & request user attachment
│   │   ├── error.middleware.js     # Centralized error handler
│   │   └── validation.middleware.js# Request payload validation helpers
│   │
│   ├── sockets/
│   │   └── socket.js               # Socket.IO rooms, connection lifecycle, and live emitters
│   │
│   └── utils/
│       ├── calculations.js         # Math formulas (depth, distance, liters, clamp)
│       └── constants.js            # Thresholds, Alert types, Pump states & topics
│
├── prisma/
│   ├── schema.prisma               # PostgreSQL models: User, Tank, SensorReading, PumpEvent, Alert
│   └── seed.js                     # Demo data seeding (test user, tank, history)
│
├── scripts/
│   ├── dev_broker.js               # Offline local Aedes broker (for working without internet)
│   └── simulate_esp8266.js         # Device simulator with HiveMQ TLS or local broker toggle
│
├── firmware/
│   └── esp8266_water_monitor.ino   # Complete ESP8266 firmware with WiFiClientSecure & HiveMQ TLS
│
├── render.yaml                     # Render Blueprint for 1-click Web Service + PostgreSQL
├── .env
├── .env.example
├── package.json
└── README.md
```

---

## 3. Environment Configuration (.env)

Create a `.env` file in `backend/`:

```env
# Server
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=*

# PostgreSQL Database (Render Managed or Local)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smartwater?sslmode=disable"

# HiveMQ Cloud Free Cluster (or Local Broker)
# For HiveMQ Cloud Free Cluster:
# MQTT_BROKER_URL="mqtts://xxxxxxxx.s1.eu.hivemq.cloud:8883"
# MQTT_USERNAME="your_hivemq_user"
# MQTT_PASSWORD="your_hivemq_password"
MQTT_BROKER_URL="mqtt://localhost:1883"
MQTT_USERNAME=""
MQTT_PASSWORD=""

# JWT Secret
JWT_SECRET="smartwater_secret_key_change_in_production"
JWT_EXPIRES_IN="7d"
```

---

## 4. Local Development & Testing

You can test the entire flow locally on your computer without physical hardware:

### Step 1: Start the Local MQTT Broker
In Terminal 1:
```bash
npm run dev:broker
```
*Starts an embedded MQTT broker on `localhost:1883`.*

### Step 2: Push Database Schema & Seed Data
Ensure PostgreSQL is running, then run:
```bash
npx prisma db push
npm run prisma:seed
```

### Step 3: Start the Backend Server
In Terminal 2:
```bash
npm run dev
```

### Step 4: Run the ESP8266 Simulator
In Terminal 3:
```bash
npm run simulate:esp
```
*Simulates the ESP8266 publishing distance readings every 4 seconds, automatic hysteresis control, and receiving remote pump commands!*

---

## 5. Deploying to Render

### Option A: Using Render Blueprint (Recommended)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint**.
3. Select your repository. Render will automatically detect [`render.yaml`](file:///c:/hsm/backend/render.yaml) and provision:
   - **`smart-water-db`**: Render Managed PostgreSQL.
   - **`smart-water-backend`**: Node.js Web Service with automatic environment variables and `/health` monitoring.
4. Set the `MQTT_BROKER_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD` environment variables in the Web Service settings from your HiveMQ Console.

### Option B: Manual Setup on Render
1. Create a **PostgreSQL** database on Render named `smartwater`.
2. Copy the **Internal Database URL**.
3. Create a **Web Service** on Render:
   - **Root Directory**: `backend` (if in a monorepo) or `./`
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - Add environment variables:
     - `DATABASE_URL`: paste the Render Internal Database URL.
     - `NODE_ENV`: `production`
     - `JWT_SECRET`: your secure string.
     - `MQTT_BROKER_URL`: `mqtts://<cluster-id>.s1.eu.hivemq.cloud:8883`
     - `MQTT_USERNAME`: your HiveMQ username.
     - `MQTT_PASSWORD`: your HiveMQ password.

---

## 6. Connecting HiveMQ Cloud Free Cluster

1. Go to [HiveMQ Cloud](https://console.hivemq.cloud/) and create a **Free Serverless Cluster** (up to 100 devices free forever).
2. Copy your **Cluster URL** (e.g. `xxxxxxxx.s1.eu.hivemq.cloud`).
3. Click on **Access Management** and create a user (e.g. `smartwater_user` + password).
4. In your backend `.env` (or Render Environment Variables):
   - `MQTT_BROKER_URL=mqtts://xxxxxxxx.s1.eu.hivemq.cloud:8883`
   - `MQTT_USERNAME=smartwater_user`
   - `MQTT_PASSWORD=your_password`

---

## 7. ESP8266 Hardware Setup & Firmware

### Pin Connections
| Component | ESP8266 Pin | GPIO Pin | Notes |
| :--- | :--- | :--- | :--- |
| **HC-SR04 TRIG** | `D1` | `GPIO 5` | Ultrasonic Trigger |
| **HC-SR04 ECHO** | `D2` | `GPIO 4` | Ultrasonic Echo (use voltage divider if 5V) |
| **Relay IN** | `D5` | `GPIO 14` | Pump Relay Control |
| **VCC** | `VIN / 5V` | — | 5V Power Supply |
| **GND** | `GND` | — | Common Ground |

### Flashing Firmware
1. Open [`firmware/esp8266_water_monitor.ino`](file:///c:/hsm/backend/firmware/esp8266_water_monitor.ino) in the Arduino IDE.
2. Install libraries:
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` (v6 or v7) by Benoît Blanchon
   - `ESP8266WiFi` (comes with ESP8266 board core)
3. Fill in your Wi-Fi SSID, Password, and HiveMQ Cloud credentials:
   ```cpp
   const char* WIFI_SSID     = "MyHomeWiFi";
   const char* WIFI_PASSWORD = "MyPassword";
   const char* MQTT_BROKER   = "xxxxxxxx.s1.eu.hivemq.cloud";
   const char* MQTT_USERNAME = "smartwater_user";
   const char* MQTT_PASSWORD = "my_secure_password";
   ```
4. Select board: **NodeMCU 1.0 (ESP-12E Module)** and upload.

---

## 8. REST API Documentation

Base URL: `http://localhost:5000/api` (or your Render URL `https://your-service.onrender.com/api`)

### System
- `GET /health` — Service health check (returns DB and MQTT connectivity).

### Authentication
- `POST /api/auth/register` — Register new user.
  - Body: `{ "name": "Prince", "email": "prince@gmail.com", "password": "password123" }`
- `POST /api/auth/login` — Login user, returns JWT token.
  - Body: `{ "email": "prince@gmail.com", "password": "password123" }`
- `GET /api/auth/me` — Get current profile (requires `Authorization: Bearer <token>`).

### Tanks
- `POST /api/tanks` — Create new tank.
  - Body: `{ "name": "Home Tank", "deviceId": "ESP8266_001", "capacityLiters": 1000, "tankDepthCm": 100, "lowThreshold": 20, "fullThreshold": 90 }`
- `GET /api/tanks` — List all tanks owned by user.
- `GET /api/tanks/:id` — Get single tank details.
- `PUT /api/tanks/:id` — Update tank thresholds or dimensions.
- `GET /api/tanks/:id/current` — Get current live status (percentage, volume, pump state, alert).

### Sensor Readings
- `GET /api/tanks/:id/readings?limit=50&from=2026-09-01&to=2026-09-14` — Historical telemetry records.

### Pump Controls
- `POST /api/tanks/:id/pump/on` — Send manual remote pump ON command.
- `POST /api/tanks/:id/pump/off` — Send manual remote pump OFF command.
- `GET /api/tanks/:id/pump/history` — Pump activation history.

### Alerts
- `GET /api/tanks/:id/alerts?isRead=false` — Fetch alerts.
- `PUT /api/alerts/:id/read` — Mark single alert as read.
- `PUT /api/alerts/read-all` — Mark all alerts for a tank as read.

### Analytics
- `GET /api/tanks/:id/analytics/daily` — Hourly average levels and pump events for past 24h.
- `GET /api/tanks/:id/analytics/weekly` — Daily breakdown and estimated consumption for past 7 days.
- `GET /api/tanks/:id/analytics/monthly` — 30-day level statistics.

---

## 9. Socket.IO Real-time Events

Connect client with Socket.IO client:
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { token: "YOUR_JWT_TOKEN" }
});

// Join tank room
socket.emit("tank:join", 1);

// Listen for live ultrasonic readings
socket.on("tank:telemetry", (data) => {
  console.log("Live Level:", data.waterLevelPercent, "%");
  console.log("Live Volume:", data.waterLevelLiters, "L");
  console.log("Pump State:", data.pumpStatus);
});

// Listen for alerts (LOW_LEVEL, CRITICAL_LOW, TANK_FULL)
socket.on("tank:alert", (alert) => {
  console.warn("ALERT:", alert.message);
});

// Listen for pump activation events
socket.on("tank:pump_event", (event) => {
  console.log("Pump event:", event.status, "Source:", event.source);
});

// Listen for device online heartbeat
socket.on("tank:device_status", (status) => {
  console.log("Device status:", status);
});
```
