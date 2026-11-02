import mongoose from 'mongoose';
import Assignment, { ASSIGNMENT_STATUSES } from '../models/Assignment.js';
import Incident from '../models/Incident.js';
import Resource from '../models/Resource.js';
import ResourceAllocation from '../models/ResourceAllocation.js';
import User from '../models/User.js';
import { allocateResources, releaseAllocation } from './resourceAllocation.service.js';
import { emitAssignmentCreated, emitAssignmentStatusUpdated } from './socket.service.js';

export class AssignmentServiceError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AssignmentServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const ALLOWED_TRANSITIONS = {
  assigned: ['accepted', 'cancelled'],
  accepted: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function createAssignment({
  incidentId,
  resourceId = null,
  responderId = null,
  assignedBy,
  ETA = null,
  notes = '',
  allocationId = null,
  idempotencyKey = null,
}) {
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AssignmentServiceError('Invalid incident ID format.', 400);
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new AssignmentServiceError('Incident not found.', 404);
  }

  if (!resourceId && !responderId) {
    throw new AssignmentServiceError(
      'An assignment must specify at least a resource or a responder.',
      400
    );
  }

  if (ETA !== null && ETA !== undefined) {
    const parsedETA = Number(ETA);
    if (isNaN(parsedETA) || parsedETA < 0) {
      throw new AssignmentServiceError('ETA must be a non-negative number.', 400);
    }
  }

  if (idempotencyKey && typeof idempotencyKey === 'string') {
    const existingKey = await Assignment.findOne({
      incidentId,
      idempotencyKey,
    })
      .populate('resourceId')
      .populate('responderId', 'name email role')
      .populate('assignedBy', 'name email role');

    if (existingKey) {
      return {
        assignment: existingKey,
        idempotent: true,
      };
    }
  }

  let verifiedResponder = null;
  if (responderId) {
    if (!mongoose.Types.ObjectId.isValid(responderId)) {
      throw new AssignmentServiceError('Invalid responder ID format.', 400);
    }
    verifiedResponder = await User.findById(responderId).select('-password');
    if (!verifiedResponder) {
      throw new AssignmentServiceError('Responder user not found.', 404);
    }
    const role = (verifiedResponder.role || '').toLowerCase();
    if (role !== 'volunteer' && role !== 'responder') {
      throw new AssignmentServiceError(
        `User ${verifiedResponder.name} is not a registered volunteer or responder.`,
        400
      );
    }

    const activeResponderAssignment = await Assignment.findOne({
      incidentId,
      responderId,
      status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
    });
    if (activeResponderAssignment) {
      throw new AssignmentServiceError(
        'Responder already has an active assignment for this incident.',
        409
      );
    }
  }

  let linkedAllocation = null;
  let verifiedResource = null;

  if (resourceId) {
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      throw new AssignmentServiceError('Invalid resource ID format.', 400);
    }
    verifiedResource = await Resource.findById(resourceId);
    if (!verifiedResource) {
      throw new AssignmentServiceError('Resource not found.', 404);
    }

    const activeResourceAssignment = await Assignment.findOne({
      incidentId,
      resourceId,
      status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
    });
    if (activeResourceAssignment) {
      throw new AssignmentServiceError(
        'Resource is already actively assigned to this incident.',
        409
      );
    }

    if (allocationId) {
      if (!mongoose.Types.ObjectId.isValid(allocationId)) {
        throw new AssignmentServiceError('Invalid allocation ID format.', 400);
      }
      linkedAllocation = await ResourceAllocation.findById(allocationId);
      if (!linkedAllocation) {
        throw new AssignmentServiceError('Specified allocation record not found.', 404);
      }
      if (linkedAllocation.status !== 'active') {
        throw new AssignmentServiceError(
          `Allocation is not active (current status: "${linkedAllocation.status}").`,
          400
        );
      }
    } else {
      const existingAlloc = await ResourceAllocation.findOne({
        incident: incidentId,
        resource: resourceId,
        status: 'active',
      });

      if (existingAlloc) {
        linkedAllocation = existingAlloc;
      } else {
        if (verifiedResource.status !== 'available' || verifiedResource.availableQuantity <= 0) {
          throw new AssignmentServiceError(
            `Resource "${verifiedResource.name}" is currently unavailable or out of stock.`,
            400
          );
        }

        const allocResult = await allocateResources({
          incidentId,
          items: [{ resourceId: verifiedResource._id, quantity: 1 }],
          userId: assignedBy,
          notes: notes || 'Allocated automatically via assignment workflow',
        });

        if (!allocResult.success || !allocResult.allocations || allocResult.allocations.length === 0) {
          throw new AssignmentServiceError(
            allocResult.message || 'Failed to allocate resource inventory.',
            400
          );
        }
        linkedAllocation = allocResult.allocations[0];
      }
    }
  }

  const assignment = await Assignment.create({
    incidentId,
    resourceId: resourceId || null,
    responderId: responderId || null,
    assignedBy,
    allocationId: linkedAllocation ? linkedAllocation._id : null,
    status: 'assigned',
    ETA: ETA !== null && ETA !== undefined ? Number(ETA) : null,
    notes: notes || '',
    idempotencyKey: idempotencyKey || null,
  });

  const populated = await Assignment.findById(assignment._id)
    .populate('resourceId')
    .populate('responderId', 'name email role')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  emitAssignmentCreated(populated);

  return {
    assignment: populated,
    idempotent: false,
  };
}

export async function updateAssignmentStatus({
  assignmentId,
  status,
  userId,
  userRole,
  notes = '',
}) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    throw new AssignmentServiceError('Invalid assignment ID format.', 400);
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new AssignmentServiceError('Assignment not found.', 404);
  }

  if (assignment.status === 'completed' || assignment.status === 'cancelled') {
    throw new AssignmentServiceError(
      `Assignment is already in terminal state "${assignment.status}" and cannot be modified.`,
      400
    );
  }

  if (!ASSIGNMENT_STATUSES.includes(status)) {
    throw new AssignmentServiceError(`Invalid assignment status: "${status}".`, 400);
  }

  const allowed = ALLOWED_TRANSITIONS[assignment.status] || [];
  if (!allowed.includes(status)) {
    throw new AssignmentServiceError(
      `Invalid status transition from "${assignment.status}" to "${status}".`,
      400
    );
  }

  const normalizedRole = (userRole || '').toLowerCase();
  const isAuthorityOrAdmin = ['authority', 'admin'].includes(normalizedRole);
  const isResponder = ['volunteer', 'responder'].includes(normalizedRole);

  if (isResponder && !isAuthorityOrAdmin) {
    if (!assignment.responderId || assignment.responderId.toString() !== userId.toString()) {
      throw new AssignmentServiceError(
        'Responders may only update status for assignments assigned to them.',
        403
      );
    }
    if (status === 'cancelled') {
      throw new AssignmentServiceError(
        'Responders are not permitted to cancel assignments. Please contact an authority.',
        403
      );
    }
  } else if (!isAuthorityOrAdmin) {
    throw new AssignmentServiceError('User is not authorized to update assignment status.', 403);
  }

  const previousStatus = assignment.status;
  assignment.status = status;
  if (notes) {
    assignment.notes = assignment.notes ? `${assignment.notes} | ${notes}` : notes;
  }

  if (status === 'cancelled' && assignment.allocationId) {
    try {
      await releaseAllocation({
        allocationId: assignment.allocationId,
        userId,
        notes: `Released due to assignment cancellation (${assignment._id})`,
      });
    } catch (allocErr) {
      if (!allocErr.message.includes('cannot be released because it is currently')) {
        console.error('Failed to release allocation on assignment cancellation:', allocErr.message);
      }
    }
  }

  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('resourceId')
    .populate('responderId', 'name email role')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  emitAssignmentStatusUpdated(populated, previousStatus);

  return populated;
}

export async function updateAssignmentDetails({
  assignmentId,
  ETA,
  notes,
  userRole,
}) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    throw new AssignmentServiceError('Invalid assignment ID format.', 400);
  }

  const normalizedRole = (userRole || '').toLowerCase();
  if (!['authority', 'admin'].includes(normalizedRole)) {
    throw new AssignmentServiceError(
      'Only authorities or administrators can update assignment details.',
      403
    );
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    throw new AssignmentServiceError('Assignment not found.', 404);
  }

  if (assignment.status === 'completed' || assignment.status === 'cancelled') {
    throw new AssignmentServiceError(
      `Cannot edit assignment in terminal state "${assignment.status}".`,
      400
    );
  }

  if (ETA !== undefined) {
    if (ETA === null || ETA === '') {
      assignment.ETA = null;
    } else {
      const parsedETA = Number(ETA);
      if (isNaN(parsedETA) || parsedETA < 0) {
        throw new AssignmentServiceError('ETA must be a non-negative number.', 400);
      }
      assignment.ETA = parsedETA;
    }
  }

  if (notes !== undefined) {
    assignment.notes = typeof notes === 'string' ? notes.trim() : assignment.notes;
  }

  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('resourceId')
    .populate('responderId', 'name email role')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  return populated;
}

export async function getIncidentAssignments(incidentId) {
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AssignmentServiceError('Invalid incident ID format.', 400);
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new AssignmentServiceError('Incident not found.', 404);
  }

  const assignments = await Assignment.find({ incidentId })
    .sort({ createdAt: -1 })
    .populate('resourceId')
    .populate('responderId', 'name email role')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  return assignments;
}

export async function getAssignmentById(assignmentId, userId = null, userRole = null) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    throw new AssignmentServiceError('Invalid assignment ID format.', 400);
  }

  const assignment = await Assignment.findById(assignmentId)
    .populate('incidentId', 'title category status severity urgency coordinates')
    .populate('resourceId')
    .populate('responderId', 'name email role')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  if (!assignment) {
    throw new AssignmentServiceError('Assignment not found.', 404);
  }

  const normalizedRole = (userRole || '').toLowerCase();
  if (['volunteer', 'responder'].includes(normalizedRole)) {
    const responderMatches =
      assignment.responderId &&
      (assignment.responderId._id || assignment.responderId).toString() === (userId || '').toString();
    if (!responderMatches) {
      throw new AssignmentServiceError(
        'Access denied. Responders may only view assignments assigned to them.',
        403
      );
    }
  } else if (!['authority', 'admin'].includes(normalizedRole)) {
    throw new AssignmentServiceError('Access denied.', 403);
  }

  return assignment;
}

export async function getResponderAssignments(responderId) {
  if (!mongoose.Types.ObjectId.isValid(responderId)) {
    throw new AssignmentServiceError('Invalid responder ID format.', 400);
  }

  const assignments = await Assignment.find({ responderId })
    .sort({ createdAt: -1 })
    .populate('incidentId', 'title category status severity urgency coordinates')
    .populate('resourceId')
    .populate('assignedBy', 'name email role')
    .populate('allocationId');

  return assignments;
}

export default {
  createAssignment,
  updateAssignmentStatus,
  updateAssignmentDetails,
  getIncidentAssignments,
  getAssignmentById,
  getResponderAssignments,
  AssignmentServiceError,
  ASSIGNMENT_STATUSES,
};
