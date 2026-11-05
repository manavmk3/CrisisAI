import mongoose from 'mongoose';
import Alert, { ALERT_TYPES } from '../models/Alert.js';
import Incident from '../models/Incident.js';
import User from '../models/User.js';
import Assignment from '../models/Assignment.js';
import { emitNewAlert } from './socket.service.js';

export const CRITICAL_PRIORITY_THRESHOLD = 80;

export class AlertServiceError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AlertServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isCriticalIncident(incident) {
  if (!incident || typeof incident !== 'object') {
    return false;
  }

  const severity = typeof incident.severity === 'string' ? incident.severity.toLowerCase() : '';
  const isCriticalSeverity = severity === 'critical';

  const score = Number(incident.priorityScore);
  const isHighPriority = !isNaN(score) && score >= CRITICAL_PRIORITY_THRESHOLD;

  return isCriticalSeverity || isHighPriority;
}

export async function resolveRecipientsForIncident(incident) {
  if (!incident) {
    return [];
  }

  const incidentId = incident._id || incident.id;
  const candidateIds = [];

  try {
    const operationalUsers = await User.find({
      role: { $in: ['authority', 'admin'] },
    }).select('_id role');

    if (Array.isArray(operationalUsers)) {
      for (const u of operationalUsers) {
        if (u && u._id) {
          candidateIds.push(u._id.toString());
        }
      }
    }
  } catch (err) {
    console.error('[AlertService] Failed to query operational staff:', err?.message || err);
  }

  if (incidentId && mongoose.Types.ObjectId.isValid(incidentId)) {
    try {
      const activeAssignments = await Assignment.find({
        incidentId,
        status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
      }).select('responderId');

      if (Array.isArray(activeAssignments)) {
        for (const assign of activeAssignments) {
          if (assign && assign.responderId) {
            const respId = (assign.responderId._id || assign.responderId).toString();
            candidateIds.push(respId);
          }
        }
      }
    } catch (assignErr) {
      console.error('[AlertService] Failed to query assigned responders:', assignErr?.message || assignErr);
    }
  }

  const validUniqueIds = [...new Set(candidateIds)].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );

  return validUniqueIds;
}

export async function createAlert({ recipient, incidentId, type, message }) {
  if (!recipient || !mongoose.Types.ObjectId.isValid(recipient)) {
    throw new AlertServiceError('Valid recipient user ID is required.', 400);
  }

  if (!incidentId || !mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AlertServiceError('Valid incident ID is required.', 400);
  }

  if (!type || !ALERT_TYPES.includes(type)) {
    throw new AlertServiceError(
      `Invalid alert type: "${type}". Allowed types: ${ALERT_TYPES.join(', ')}`,
      400
    );
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new AlertServiceError('Alert message must be a non-empty string.', 400);
  }

  const existingAlert = await Alert.findOne({
    recipient,
    incidentId,
    type,
  });

  if (existingAlert) {
    return existingAlert;
  }

  const newAlert = await Alert.create({
    recipient,
    incidentId,
    type,
    message: message.trim(),
    readStatus: false,
    readAt: null,
  });

  try {
    emitNewAlert(newAlert);
  } catch (socketErr) {
    console.warn('[AlertService] Socket emission error:', socketErr?.message || socketErr);
  }

  return newAlert;
}

export async function createCriticalIncidentAlerts(incident) {
  if (!incident) {
    return [];
  }

  if (!isCriticalIncident(incident)) {
    return [];
  }

  const incidentId = incident._id || incident.id;
  if (!incidentId || !mongoose.Types.ObjectId.isValid(incidentId)) {
    return [];
  }

  const recipientIds = await resolveRecipientsForIncident(incident);
  if (recipientIds.length === 0) {
    return [];
  }

  const summary = incident.summary || incident.report || 'Critical emergency reported';
  const location = incident.location ? `at ${incident.location}` : 'in current jurisdiction';
  const score = incident.priorityScore !== undefined ? ` (Priority ${incident.priorityScore}/100)` : '';
  const message = `CRITICAL ALERT: ${summary} ${location}${score}. Immediate emergency response required.`;

  const createdAlerts = [];

  for (const recipientId of recipientIds) {
    try {
      const existing = await Alert.findOne({
        recipient: recipientId,
        incidentId,
        type: 'critical_incident',
      });

      if (!existing) {
        const alert = await Alert.create({
          recipient: recipientId,
          incidentId,
          type: 'critical_incident',
          message,
          readStatus: false,
          readAt: null,
        });

        try {
          emitNewAlert(alert);
        } catch (sErr) {
          console.warn('[AlertService] Socket delivery notice:', sErr?.message || sErr);
        }

        createdAlerts.push(alert);
      }
    } catch (itemErr) {
      console.error(`[AlertService] Failed to create alert for recipient ${recipientId}:`, itemErr?.message || itemErr);
    }
  }

  return createdAlerts;
}

export async function getUserAlerts(userId, { readStatus, type, limit = 50, page = 1 } = {}) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AlertServiceError('Invalid user ID.', 400);
  }

  const query = { recipient: userId };

  if (readStatus !== undefined && readStatus !== null && readStatus !== '') {
    query.readStatus = readStatus === 'true' || readStatus === true;
  }

  if (type !== undefined && type !== null && type !== '') {
    if (!ALERT_TYPES.includes(type)) {
      throw new AlertServiceError(
        `Invalid type filter: "${type}". Allowed: ${ALERT_TYPES.join(', ')}`,
        400
      );
    }
    query.type = type;
  }

  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const parsedPage = Math.max(1, Number(page) || 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const alerts = await Alert.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .populate('incidentId', 'summary report location category severity urgency priorityScore status');

  return alerts;
}

export async function getUnreadCount(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AlertServiceError('Invalid user ID.', 400);
  }

  const count = await Alert.countDocuments({
    recipient: userId,
    readStatus: false,
  });

  return count;
}

export async function markAlertAsRead(alertId, userId) {
  if (!alertId || !mongoose.Types.ObjectId.isValid(alertId)) {
    throw new AlertServiceError('Invalid alert ID format.', 400);
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AlertServiceError('Invalid user ID format.', 400);
  }

  const alert = await Alert.findById(alertId);
  if (!alert) {
    throw new AlertServiceError('Alert not found.', 404);
  }

  const recipientStr = (alert.recipient?._id || alert.recipient).toString();
  if (recipientStr !== userId.toString()) {
    throw new AlertServiceError('Access denied. You may only modify your own alerts.', 403);
  }

  if (alert.readStatus === true) {
    return alert;
  }

  alert.readStatus = true;
  alert.readAt = new Date();
  await alert.save();

  return alert;
}

export async function markAllAlertsAsRead(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AlertServiceError('Invalid user ID format.', 400);
  }

  const now = new Date();
  const updateResult = await Alert.updateMany(
    { recipient: userId, readStatus: false },
    { $set: { readStatus: true, readAt: now } }
  );

  const modified = updateResult.modifiedCount !== undefined ? updateResult.modifiedCount : updateResult.nModified || 0;

  return {
    success: true,
    modifiedCount: modified,
    readAt: now,
  };
}

export async function getAlertById(alertId, userId) {
  if (!alertId || !mongoose.Types.ObjectId.isValid(alertId)) {
    throw new AlertServiceError('Invalid alert ID format.', 400);
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AlertServiceError('Invalid user ID format.', 400);
  }

  const alert = await Alert.findById(alertId)
    .populate('incidentId', 'summary report location category severity urgency priorityScore status');

  if (!alert) {
    throw new AlertServiceError('Alert not found.', 404);
  }

  const recipientStr = (alert.recipient?._id || alert.recipient).toString();
  if (recipientStr !== userId.toString()) {
    throw new AlertServiceError('Access denied. You may only view your own alerts.', 403);
  }

  return alert;
}

export default {
  createAlert,
  createCriticalIncidentAlerts,
  resolveRecipientsForIncident,
  isCriticalIncident,
  getUserAlerts,
  getUnreadCount,
  markAlertAsRead,
  markAllAlertsAsRead,
  getAlertById,
  CRITICAL_PRIORITY_THRESHOLD,
  AlertServiceError,
};

