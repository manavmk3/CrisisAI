import {
  allocateResources,
  releaseAllocation as releaseAllocationService,
  getIncidentAllocations as getIncidentAllocationsService,
  getCandidatesForIncident as getCandidatesForIncidentService,
  AllocationServiceError,
} from '../services/resourceAllocation.service.js';
import Resource from '../models/Resource.js';
import {
  emitResourceAssigned,
  emitResourceReleased,
  emitResourceUpdated,
} from '../services/socket.service.js';

export const allocateToIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, idempotencyKey, notes } = req.body || {};

    const result = await allocateResources({
      incidentId: id,
      items,
      userId: req.user?._id || null,
      idempotencyKey,
      notes,
    });

    if (result.success && !result.idempotent) {
      emitResourceAssigned({ incidentId: id, allocations: result.allocations || [] });

      if (Array.isArray(result.allocations)) {
        for (const alloc of result.allocations) {
          const resId = alloc.resource?._id || alloc.resource;
          if (resId) {
            Resource.findById(resId).then((r) => {
              if (r) emitResourceUpdated(r);
            }).catch(() => {});
          }
        }
      }
    }

    const statusCode = result.success ? (result.idempotent ? 200 : 201) : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    if (err instanceof AllocationServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        details: err.details,
      });
    }

    console.error('[Allocation Controller] Error allocating resources:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while allocating resources.',
    });
  }
};

export const getIncidentAllocations = async (req, res) => {
  try {
    const { id } = req.params;
    const allocations = await getIncidentAllocationsService(id);

    return res.status(200).json({
      success: true,
      count: allocations.length,
      data: allocations,
    });
  } catch (err) {
    if (err instanceof AllocationServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    console.error('[Allocation Controller] Error fetching incident allocations:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching allocations.',
    });
  }
};

export const getCandidatesForIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const candidates = await getCandidatesForIncidentService(id);

    return res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (err) {
    if (err instanceof AllocationServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    console.error('[Allocation Controller] Error fetching candidate resources:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching candidate resources.',
    });
  }
};

export const releaseAllocation = async (req, res) => {
  try {
    const { allocationId } = req.params;
    const { notes } = req.body || {};

    const result = await releaseAllocationService({
      allocationId,
      userId: req.user?._id || null,
      notes,
    });

    if (result.success && result.data) {
      emitResourceReleased({
        allocationId,
        incidentId: result.data.incident,
        resourceId: result.data.resource,
        quantity: result.data.quantity,
      });

      if (result.data.resource) {
        Resource.findById(result.data.resource).then((r) => {
          if (r) emitResourceUpdated(r);
        }).catch(() => {});
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AllocationServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    console.error('[Allocation Controller] Error releasing allocation:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while releasing allocation.',
    });
  }
};

export default {
  allocateToIncident,
  getIncidentAllocations,
  getCandidatesForIncident,
  releaseAllocation,
};
