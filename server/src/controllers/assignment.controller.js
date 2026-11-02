import assignmentService, {
  AssignmentServiceError,
} from '../services/assignment.service.js';

export async function createAssignment(req, res) {
  try {
    const incidentId = req.params.id || req.body.incidentId;
    const {
      resourceId,
      responderId,
      ETA,
      notes,
      allocationId,
      idempotencyKey,
    } = req.body;

    const assignedBy = req.user?._id;
    if (!assignedBy) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user identity found.',
      });
    }

    const result = await assignmentService.createAssignment({
      incidentId,
      resourceId,
      responderId,
      assignedBy,
      ETA,
      notes,
      allocationId,
      idempotencyKey,
    });

    const statusCode = result.idempotent ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      message: result.idempotent
        ? 'Assignment returned via idempotency key.'
        : 'Assignment created successfully.',
      data: result.assignment,
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating assignment.',
    });
  }
}

export async function getIncidentAssignments(req, res) {
  try {
    const incidentId = req.params.id || req.params.incidentId;
    const assignments = await assignmentService.getIncidentAssignments(incidentId);

    return res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving incident assignments.',
    });
  }
}

export async function getAssignmentById(req, res) {
  try {
    const assignmentId = req.params.assignmentId || req.params.id;
    const userId = req.user?._id;
    const userRole = req.user?.role;

    const assignment = await assignmentService.getAssignmentById(
      assignmentId,
      userId,
      userRole
    );

    return res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving assignment.',
    });
  }
}

export async function updateAssignmentStatus(req, res) {
  try {
    const assignmentId = req.params.assignmentId || req.params.id;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required.',
      });
    }

    const updated = await assignmentService.updateAssignmentStatus({
      assignmentId,
      status,
      userId: req.user._id,
      userRole: req.user.role,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: `Assignment status successfully updated to "${status}".`,
      data: updated,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating assignment status.',
    });
  }
}

export async function updateAssignment(req, res) {
  try {
    const assignmentId = req.params.assignmentId || req.params.id;
    const { ETA, notes } = req.body;

    const updated = await assignmentService.updateAssignmentDetails({
      assignmentId,
      ETA,
      notes,
      userRole: req.user.role,
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment details updated successfully.',
      data: updated,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating assignment.',
    });
  }
}

export async function getMyAssignments(req, res) {
  try {
    const responderId = req.user._id;
    const assignments = await assignmentService.getResponderAssignments(responderId);

    return res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    if (error instanceof AssignmentServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching responder assignments.',
    });
  }
}

export async function getAvailableResponders(req, res) {
  try {
    const User = (await import('../models/User.js')).default;
    const responders = await User.find({
      role: { $in: ['volunteer', 'responder'] },
    }).select('name email role');

    return res.status(200).json({
      success: true,
      count: responders.length,
      data: responders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching available responders.',
    });
  }
}

export default {
  createAssignment,
  getIncidentAssignments,
  getAssignmentById,
  updateAssignmentStatus,
  updateAssignment,
  getMyAssignments,
  getAvailableResponders,
};
