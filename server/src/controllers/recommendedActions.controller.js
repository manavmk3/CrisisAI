import mongoose from 'mongoose';
import recommendedActionsService from '../services/recommendedActions.service.js';

export async function getIncidentRecommendedActions(req, res) {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID format.',
      });
    }

    const actions = await recommendedActionsService.getRecommendedActionsForIncident(id);

    return res.status(200).json({
      success: true,
      incidentId: id,
      count: actions.length,
      data: actions,
    });
  } catch (err) {
    if (err.message === 'Incident not found.') {
      return res.status(404).json({
        success: false,
        message: 'Incident not found.',
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to retrieve recommended actions for incident.',
    });
  }
}

export async function getRecommendedActions(req, res) {
  try {
    const { limit, actionType, severity, minScore } = req.query;

    const actions = await recommendedActionsService.getRecommendedActionsAcrossActiveIncidents({
      limit,
      actionType,
      severity,
      minScore,
    });

    return res.status(200).json({
      success: true,
      count: actions.length,
      data: actions,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to retrieve system-wide recommended actions.',
    });
  }
}

export default {
  getIncidentRecommendedActions,
  getRecommendedActions,
};

