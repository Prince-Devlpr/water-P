const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { SOCKET_EVENTS } = require('../utils/constants');

let io = null;

/**
 * Initializes Socket.IO with an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN === '*' ? true : env.CLIENT_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Optional authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        socket.user = decoded;
      } catch (err) {
        // Token provided but invalid - allow connection as guest or handle per app needs
        console.warn('Socket connection with invalid token:', err.message);
      }
    }
    return next();
  });

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    console.log(`🔌 Client connected to Socket.IO: ${socket.id} (User: ${socket.user?.id || 'anonymous'})`);

    // Join specific tank room for scoped updates
    socket.on(SOCKET_EVENTS.JOIN_TANK, (tankId) => {
      if (tankId) {
        const roomName = `tank:${tankId}`;
        socket.join(roomName);
        console.log(`📡 Socket ${socket.id} joined ${roomName}`);
      }
    });

    // Leave tank room
    socket.on(SOCKET_EVENTS.LEAVE_TANK, (tankId) => {
      if (tankId) {
        const roomName = `tank:${tankId}`;
        socket.leave(roomName);
        console.log(`📡 Socket ${socket.id} left ${roomName}`);
      }
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

/**
 * Get active Socket.IO server instance
 * @returns {Server|null}
 */
function getIO() {
  return io;
}

/**
 * Broadcast telemetry to tank room and global listeners
 */
function emitTelemetry(tankId, data) {
  if (!io) return;
  io.to(`tank:${tankId}`).emit(SOCKET_EVENTS.TELEMETRY, data);
  io.emit(SOCKET_EVENTS.TELEMETRY, data); // Global feed for dashboard
}

/**
 * Broadcast alert to tank room and global listeners
 */
function emitAlert(tankId, alert) {
  if (!io) return;
  io.to(`tank:${tankId}`).emit(SOCKET_EVENTS.ALERT, alert);
  io.emit(SOCKET_EVENTS.ALERT, alert);
}

/**
 * Broadcast pump event
 */
function emitPumpEvent(tankId, event) {
  if (!io) return;
  io.to(`tank:${tankId}`).emit(SOCKET_EVENTS.PUMP_EVENT, event);
  io.emit(SOCKET_EVENTS.PUMP_EVENT, event);
}

/**
 * Broadcast device online/status update
 */
function emitDeviceStatus(deviceId, status) {
  if (!io) return;
  io.emit(SOCKET_EVENTS.DEVICE_STATUS, { deviceId, ...status });
}

module.exports = {
  initSocket,
  getIO,
  emitTelemetry,
  emitAlert,
  emitPumpEvent,
  emitDeviceStatus,
};
