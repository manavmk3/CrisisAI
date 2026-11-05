import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.js';

let io = null;

const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

export function initSocket(httpServer, customOptions = {}) {
  if (io) {
    return io;
  }

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (config.isDevelopment || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by Socket.IO CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  };

  io = new SocketIOServer(httpServer, {
    cors: corsOptions,
    pingTimeout: 20000,
    pingInterval: 25000,
    ...customOptions,
  });

  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const authToken = socket.handshake.auth?.token;
      let token = authToken;

      if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      if (!token) {
        socket.user = null;
        socket.isPublic = true;
        return next();
      }

      let decoded;
      try {
        decoded = jwt.verify(token, config.jwt.secret);
      } catch (jwtErr) {
        if (jwtErr.name === 'TokenExpiredError') {
          return next(new Error('Authentication error: Token expired'));
        }
        return next(new Error('Authentication error: Invalid token'));
      }

      if (!decoded || !decoded.id) {
        return next(new Error('Authentication error: Malformed token payload'));
      }

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        agency: user.agency || '',
      };
      socket.isPublic = false;

      return next();
    } catch (err) {
      console.error('[Socket.IO Auth] Handshake auth error:', err.message);
      return next(new Error('Authentication error: Internal validation failure'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.user) {
      socket.join('authenticated');
      socket.join(`role:${socket.user.role}`);
      socket.join(`user:${socket.user._id}`);

      if (['authority', 'admin'].includes(socket.user.role)) {
        socket.join('room:authorized');
      }
    } else {
      socket.join('public');
    }

    socket.on('join', (room, callback) => {
      const privilegedRooms = ['room:authorized', 'role:authority', 'role:admin'];
      if (privilegedRooms.includes(room)) {
        if (!socket.user || !['authority', 'admin'].includes(socket.user.role)) {
          if (typeof callback === 'function') {
            callback({ success: false, message: 'Unauthorized room subscription' });
          }
          return;
        }
      }
      socket.join(room);
      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    });

    socket.on('subscribe', (room, callback) => {
      const privilegedRooms = ['room:authorized', 'role:authority', 'role:admin'];
      if (privilegedRooms.includes(room)) {
        if (!socket.user || !['authority', 'admin'].includes(socket.user.role)) {
          if (typeof callback === 'function') {
            callback({ success: false, message: 'Unauthorized room subscription' });
          }
          return;
        }
      }
      socket.join(room);
      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    });

    socket.on('disconnect', () => {});

    socket.on('error', (err) => {
      console.warn('[Socket.IO Client Error]:', err?.message || err);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export function closeSocket() {
  if (io) {
    try {
      io.close();
    } catch (err) {
      console.warn('[Socket.IO] Error closing server:', err.message);
    }
    io = null;
  }
}

export function emitEvent(eventName, payload, room = null) {
  if (!io) return;
  try {
    if (room) {
      io.to(room).emit(eventName, payload);
    } else {
      io.emit(eventName, payload);
    }
  } catch (err) {
    console.error(`[Socket.IO] Failed to emit event "${eventName}":`, err.message);
  }
}

export function emitIncidentCreated(incident) {
  if (!incident) return;
  const payload = {
    event: 'incident:created',
    incidentId: (incident._id || incident.id).toString(),
    id: (incident._id || incident.id).toString(),
    category: incident.category,
    severity: incident.severity,
    urgency: incident.urgency,
    status: incident.status,
    verificationState: incident.verificationState || 'verified',
    priorityScore: incident.priorityScore,
    hasCoordinates: Boolean(
      incident.coordinates?.latitude != null && incident.coordinates?.longitude != null
    ),
    coordinates: incident.coordinates || { latitude: null, longitude: null },
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('incident:created', payload);
}

export function emitIncidentUpdated(incident) {
  if (!incident) return;
  const payload = {
    event: 'incident:updated',
    incidentId: (incident._id || incident.id).toString(),
    id: (incident._id || incident.id).toString(),
    category: incident.category,
    severity: incident.severity,
    urgency: incident.urgency,
    status: incident.status,
    verificationState: incident.verificationState,
    priorityScore: incident.priorityScore,
    hasCoordinates: Boolean(
      incident.coordinates?.latitude != null && incident.coordinates?.longitude != null
    ),
    coordinates: incident.coordinates || { latitude: null, longitude: null },
    updatedAt: incident.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('incident:updated', payload);
}

export function emitIncidentVerificationChanged(incident, previousState, newState) {
  if (!incident || previousState === newState) return;
  const payload = {
    event: 'incident:verification-changed',
    incidentId: (incident._id || incident.id).toString(),
    id: (incident._id || incident.id).toString(),
    previousState,
    verificationState: newState,
    updatedAt: incident.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('incident:verification-changed', payload);
}

export function emitIncidentResolved(incident) {
  if (!incident) return;
  const payload = {
    event: 'incident:resolved',
    incidentId: (incident._id || incident.id).toString(),
    id: (incident._id || incident.id).toString(),
    status: 'resolved',
    updatedAt: incident.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('incident:resolved', payload);
}

export function emitResourceCreated(resource) {
  if (!resource) return;
  const payload = {
    event: 'resource:created',
    resourceId: (resource._id || resource.id).toString(),
    id: (resource._id || resource.id).toString(),
    name: resource.name,
    type: resource.type,
    quantity: resource.quantity,
    availableQuantity: resource.availableQuantity,
    status: resource.status,
    hasCoordinates: Boolean(resource.latitude != null && resource.longitude != null),
    latitude: resource.latitude,
    longitude: resource.longitude,
    location: resource.location,
    updatedAt: resource.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('resource:created', payload);
}

export function emitResourceUpdated(resource) {
  if (!resource) return;
  const payload = {
    event: 'resource:updated',
    resourceId: (resource._id || resource.id).toString(),
    id: (resource._id || resource.id).toString(),
    name: resource.name,
    type: resource.type,
    quantity: resource.quantity,
    availableQuantity: resource.availableQuantity,
    status: resource.status,
    hasCoordinates: Boolean(resource.latitude != null && resource.longitude != null),
    latitude: resource.latitude,
    longitude: resource.longitude,
    location: resource.location,
    updatedAt: resource.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('resource:updated', payload);
}

export function emitResourceAssigned({ incidentId, allocations }) {
  if (!incidentId || !allocations || allocations.length === 0) return;
  const safeAllocations = allocations.map((a) => ({
    allocationId: (a._id || a.id).toString(),
    resourceId: (a.resource?._id || a.resource || '').toString(),
    resourceType: a.resourceType,
    requestedType: a.requestedType || a.resourceType,
    quantity: a.quantity,
    status: a.status,
  }));

  const payload = {
    event: 'resource:assigned',
    incidentId: incidentId.toString(),
    allocations: safeAllocations,
    timestamp: new Date().toISOString(),
  };
  emitEvent('resource:assigned', payload);
}

export function emitResourceReleased({ allocationId, incidentId, resourceId, quantity }) {
  if (!allocationId) return;
  const payload = {
    event: 'resource:released',
    allocationId: allocationId.toString(),
    incidentId: incidentId ? incidentId.toString() : null,
    resourceId: resourceId ? resourceId.toString() : null,
    quantity,
    timestamp: new Date().toISOString(),
  };
  emitEvent('resource:released', payload);
}

export function emitAssignmentCreated(assignment) {
  if (!assignment) return;
  const payload = {
    event: 'assignment:created',
    assignmentId: (assignment._id || assignment.id).toString(),
    incidentId: (assignment.incidentId?._id || assignment.incidentId || '').toString(),
    resourceId: assignment.resourceId ? (assignment.resourceId._id || assignment.resourceId).toString() : null,
    responderId: assignment.responderId ? (assignment.responderId._id || assignment.responderId).toString() : null,
    status: assignment.status,
    ETA: assignment.ETA,
    assignedBy: assignment.assignedBy ? (assignment.assignedBy._id || assignment.assignedBy).toString() : null,
    allocationId: assignment.allocationId ? (assignment.allocationId._id || assignment.allocationId).toString() : null,
    notes: assignment.notes || '',
    createdAt: assignment.createdAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('assignment:created', payload);
}

export function emitAssignmentStatusUpdated(assignment, previousStatus) {
  if (!assignment) return;
  const payload = {
    event: 'assignment:status-updated',
    assignmentId: (assignment._id || assignment.id).toString(),
    incidentId: (assignment.incidentId?._id || assignment.incidentId || '').toString(),
    responderId: assignment.responderId ? (assignment.responderId._id || assignment.responderId).toString() : null,
    previousStatus,
    status: assignment.status,
    declineReason: assignment.declineReason || null,
    ETA: assignment.ETA,
    updatedAt: assignment.updatedAt,
    timestamp: new Date().toISOString(),
  };
  emitEvent('assignment:status-updated', payload);
}

export function emitAssignmentDeclined(assignment, reason = null) {
  if (!assignment) return;
  const payload = {
    event: 'assignment:declined',
    assignmentId: (assignment._id || assignment.id).toString(),
    incidentId: (assignment.incidentId?._id || assignment.incidentId || '').toString(),
    responderId: assignment.responderId ? (assignment.responderId._id || assignment.responderId).toString() : null,
    reason: reason || assignment.declineReason || null,
    status: assignment.status,
    timestamp: new Date().toISOString(),
  };
  emitEvent('assignment:declined', payload);
}

export function emitResponderLocationUpdated(assignment) {
  if (!assignment) return;
  const payload = {
    event: 'assignment:location-updated',
    assignmentId: (assignment._id || assignment.id).toString(),
    incidentId: (assignment.incidentId?._id || assignment.incidentId || '').toString(),
    responderId: assignment.responderId ? (assignment.responderId._id || assignment.responderId).toString() : null,
    location: assignment.responderLocation || null,
    timestamp: new Date().toISOString(),
  };
  emitEvent('assignment:location-updated', payload);
}

export function emitNewAlert(alert) {
  if (!alert) return;
  const recipientId = (alert.recipient?._id || alert.recipient || '').toString();
  if (!recipientId) return;

  const payload = {
    event: 'alert:new',
    alertId: (alert._id || alert.id).toString(),
    id: (alert._id || alert.id).toString(),
    recipient: recipientId,
    incidentId: (alert.incidentId?._id || alert.incidentId || '').toString(),
    type: alert.type,
    message: alert.message,
    readStatus: Boolean(alert.readStatus),
    createdAt: alert.createdAt,
    timestamp: new Date().toISOString(),
  };

  emitEvent('alert:new', payload, `user:${recipientId}`);
}

export default {
  initSocket,
  getIO,
  closeSocket,
  emitEvent,
  emitIncidentCreated,
  emitIncidentUpdated,
  emitIncidentVerificationChanged,
  emitIncidentResolved,
  emitResourceCreated,
  emitResourceUpdated,
  emitResourceAssigned,
  emitResourceReleased,
  emitAssignmentCreated,
  emitAssignmentStatusUpdated,
  emitAssignmentDeclined,
  emitResponderLocationUpdated,
  emitNewAlert,
};
