/**
 * Application Constants
 */

const ALERT_TYPES = {
  CRITICAL_LOW: 'CRITICAL_LOW',
  LOW_LEVEL: 'LOW_LEVEL',
  TANK_FULL: 'TANK_FULL',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  NORMAL: 'NORMAL',
};

const ALERT_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
};

const PUMP_STATUS = {
  ON: 'ON',
  OFF: 'OFF',
};

const PUMP_REASONS = {
  LOW_LEVEL: 'LOW_LEVEL',
  TANK_FULL: 'TANK_FULL',
  USER_COMMAND: 'USER_COMMAND',
  EMERGENCY_SHUTDOWN: 'EMERGENCY_SHUTDOWN',
};

const PUMP_SOURCES = {
  AUTO: 'AUTO',
  APP: 'APP',
  MANUAL: 'MANUAL',
};

const MQTT_TOPICS = {
  BASE_PREFIX: 'smartwater',
  TELEMETRY: (deviceId) => `smartwater/${deviceId}/telemetry`,
  STATUS: (deviceId) => `smartwater/${deviceId}/status`,
  COMMAND_PUMP: (deviceId) => `smartwater/${deviceId}/command/pump`,
  ALL_TELEMETRY: 'smartwater/+/telemetry',
  ALL_STATUS: 'smartwater/+/status',
};

const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_TANK: 'tank:join',
  LEAVE_TANK: 'tank:leave',
  TELEMETRY: 'tank:telemetry',
  ALERT: 'tank:alert',
  PUMP_EVENT: 'tank:pump_event',
  DEVICE_STATUS: 'tank:device_status',
};

module.exports = {
  ALERT_TYPES,
  ALERT_SEVERITY,
  PUMP_STATUS,
  PUMP_REASONS,
  PUMP_SOURCES,
  MQTT_TOPICS,
  SOCKET_EVENTS,
};
