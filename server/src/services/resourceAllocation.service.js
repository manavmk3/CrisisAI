import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import Resource, { RESOURCE_TYPES } from '../models/Resource.js';
import ResourceAllocation from '../models/ResourceAllocation.js';
import {
  rankCandidateResources,
  RESOURCE_TYPE_COMPATIBILITY,
} from './resourceRanking.js';

export class AllocationServiceError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AllocationServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function allocateResources({
  incidentId,
  items,
  userId = null,
  idempotencyKey = null,
  notes = '',
}) {
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AllocationServiceError('Invalid incident ID format.', 400);
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new AllocationServiceError('Incident not found.', 404);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AllocationServiceError(
      'Request must contain a non-empty items array.',
      400
    );
  }

  if (idempotencyKey && typeof idempotencyKey === 'string') {
    const existing = await ResourceAllocation.find({
      incident: incidentId,
      idempotencyKey,
      status: 'active',
    }).populate('resource');

    if (existing.length > 0) {
      return {
        success: true,
        idempotent: true,
        incidentId,
        allocations: existing,
        shortages: [],
        fullyFulfilled: true,
        message: 'Returning existing allocation for idempotency key.',
      };
    }
  }

  const validatedItems = [];
  const knownTypes = new Set([
    ...RESOURCE_TYPES,
    ...Object.keys(RESOURCE_TYPE_COMPATIBILITY),
  ]);

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new AllocationServiceError('Each allocation item must be an object.', 400);
    }

    const { resourceId, type, quantity } = item;

    if (quantity === undefined || quantity === null) {
      throw new AllocationServiceError('Each item must specify a quantity.', 400);
    }

    const qtyNum = Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      throw new AllocationServiceError(
        'Allocation quantity must be a positive integer greater than 0.',
        400
      );
    }

    if (!resourceId && !type) {
      throw new AllocationServiceError(
        'Each item must specify either resourceId or type.',
        400
      );
    }

    if (resourceId) {
      if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        throw new AllocationServiceError(`Invalid resource ID format: "${resourceId}"`, 400);
      }
    }

    if (type) {
      const normType = String(type).toLowerCase();
      if (!knownTypes.has(normType)) {
        throw new AllocationServiceError(
          `Unknown resource type: "${type}". Allowed: ${Array.from(knownTypes).join(', ')}`,
          400
        );
      }
    }

    validatedItems.push({
      resourceId: resourceId || null,
      type: type ? String(type).toLowerCase() : null,
      quantity: qtyNum,
    });
  }

  const allocatedRecords = [];
  const decrementedLogs = [];
  const shortages = [];

  try {
    for (const item of validatedItems) {
      let needed = item.quantity;
      let candidateResources = [];

      if (item.resourceId) {
        const specificRes = await Resource.findById(item.resourceId);
        if (!specificRes) {
          throw new AllocationServiceError(`Resource not found: ${item.resourceId}`, 404);
        }
        if (specificRes.status !== 'available') {
          shortages.push({
            requestedType: specificRes.type,
            resourceId: item.resourceId,
            requestedQuantity: item.quantity,
            availableQuantity: 0,
            shortage: item.quantity,
            reason: `Resource status is "${specificRes.status}", not available.`,
          });
          continue;
        }
        candidateResources = [specificRes];
      } else {
        const primaryMatches = await Resource.find({
          type: item.type,
          status: 'available',
          availableQuantity: { $gt: 0 },
        });

        let compatibleMatches = [];
        const compatTypes = (RESOURCE_TYPE_COMPATIBILITY[item.type] || []).filter(
          (t) => t !== item.type
        );
        if (compatTypes.length > 0) {
          compatibleMatches = await Resource.find({
            type: { $in: compatTypes },
            status: 'available',
            availableQuantity: { $gt: 0 },
          });
        }

        const allCandidates = [...primaryMatches, ...compatibleMatches];
        const ranked = rankCandidateResources(incident, allCandidates);
        candidateResources = ranked.map((r) => r.rawResource);
      }

      let allocatedForThisItem = 0;

      for (const res of candidateResources) {
        if (needed <= 0) break;

        const takeQty = Math.min(res.availableQuantity, needed);
        if (takeQty <= 0) continue;

        const updated = await Resource.findOneAndUpdate(
          {
            _id: res._id,
            availableQuantity: { $gte: takeQty },
            status: 'available',
          },
          {
            $inc: { availableQuantity: -takeQty },
          },
          { returnDocument: 'after' }
        );

        if (!updated) {
          continue;
        }

        decrementedLogs.push({ resourceId: res._id, quantity: takeQty });
        allocatedForThisItem += takeQty;
        needed -= takeQty;

        const allocationDoc = await ResourceAllocation.create({
          incident: incidentId,
          resource: res._id,
          resourceType: res.type,
          requestedType: item.type || res.type,
          quantity: takeQty,
          status: 'active',
          allocatedBy: userId,
          idempotencyKey: idempotencyKey || null,
          notes,
        });

        allocatedRecords.push(allocationDoc);
      }

      if (needed > 0) {
        shortages.push({
          requestedType: item.type || 'specified_resource',
          resourceId: item.resourceId || null,
          requestedQuantity: item.quantity,
          allocatedQuantity: allocatedForThisItem,
          shortage: needed,
          reason: 'Insufficient available inventory.',
        });
      }
    }

    if (allocatedRecords.length === 0 && shortages.length > 0) {
      return {
        success: false,
        incidentId,
        allocations: [],
        shortages,
        fullyFulfilled: false,
        message: 'Could not fulfill allocation request due to inventory shortages.',
      };
    }

    const fullyFulfilled = shortages.length === 0;

    return {
      success: true,
      incidentId,
      allocations: allocatedRecords,
      shortages,
      fullyFulfilled,
      message: fullyFulfilled
        ? 'All requested resources allocated successfully.'
        : 'Partially fulfilled allocation request with shortages.',
    };
  } catch (err) {
    for (const log of decrementedLogs) {
      try {
        await Resource.findByIdAndUpdate(log.resourceId, {
          $inc: { availableQuantity: log.quantity },
        });
      } catch (rollbackErr) {
        console.error('Failed to rollback resource decrement:', rollbackErr);
      }
    }

    for (const alloc of allocatedRecords) {
      try {
        await ResourceAllocation.findByIdAndDelete(alloc._id);
      } catch (allocCleanupErr) {
        console.error('Failed to cleanup allocation document:', allocCleanupErr);
      }
    }

    throw err;
  }
}

export async function releaseAllocation({ allocationId, userId = null, notes = '' }) {
  if (!mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new AllocationServiceError('Invalid allocation ID format.', 400);
  }

  const allocation = await ResourceAllocation.findById(allocationId);
  if (!allocation) {
    throw new AllocationServiceError('Allocation not found.', 404);
  }

  const updatedAllocation = await ResourceAllocation.findOneAndUpdate(
    {
      _id: allocationId,
      status: 'active',
    },
    {
      status: 'released',
      releasedBy: userId,
      releasedAt: new Date(),
      ...(notes ? { notes } : {}),
    },
    { returnDocument: 'after' }
  );

  if (!updatedAllocation) {
    throw new AllocationServiceError(
      `Allocation cannot be released because it is currently "${allocation.status}".`,
      400
    );
  }

  await Resource.findByIdAndUpdate(allocation.resource, {
    $inc: { availableQuantity: allocation.quantity },
  });

  return {
    success: true,
    message: 'Allocation released and inventory restored successfully.',
    data: updatedAllocation,
  };
}

export async function getIncidentAllocations(incidentId) {
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AllocationServiceError('Invalid incident ID format.', 400);
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new AllocationServiceError('Incident not found.', 404);
  }

  const allocations = await ResourceAllocation.find({ incident: incidentId })
    .sort({ createdAt: -1 })
    .populate('resource')
    .populate('allocatedBy', 'name email role')
    .populate('releasedBy', 'name email role');

  return allocations;
}

export async function getCandidatesForIncident(incidentId) {
  if (!mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new AllocationServiceError('Invalid incident ID format.', 400);
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new AllocationServiceError('Incident not found.', 404);
  }

  const availableResources = await Resource.find({
    status: 'available',
    availableQuantity: { $gt: 0 },
  });

  const ranked = rankCandidateResources(incident, availableResources);
  return ranked;
}

export default {
  allocateResources,
  releaseAllocation,
  getIncidentAllocations,
  getCandidatesForIncident,
  AllocationServiceError,
};
