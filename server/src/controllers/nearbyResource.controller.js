import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import {
  findNearbyResources,
  NearbyResourceServiceError,
} from '../services/nearbyResource.service.js';

export const getNearbyResources = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID format.',
      });
    }

    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found.',
      });
    }

    const {
      radiusKm,
      radius,
      type,
      status,
      availableOnly,
      minQuantity,
      exactTypeOnly,
    } = req.query;

    const result = await findNearbyResources({
      incident,
      radiusKm: radiusKm !== undefined ? radiusKm : radius,
      type,
      status,
      availableOnly,
      minQuantity,
      exactTypeOnly: exactTypeOnly === 'true' || exactTypeOnly === true,
    });

    return res.status(200).json({
      success: true,
      count: result.count,
      data: result.resources,
      incident: {
        id: incident._id,
        summary: incident.summary,
        coordinates: result.searchOptions.incidentCoordinates,
        requiredResources: incident.requiredResources,
      },
      searchOptions: result.searchOptions,
    });
  } catch (err) {
    if (err instanceof NearbyResourceServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        details: err.details,
      });
    }

    console.error('[NearbyResource Controller] Error fetching nearby resources:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while searching nearby resources.',
    });
  }
};

export default {
  getNearbyResources,
};
