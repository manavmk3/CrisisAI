import mongoose from 'mongoose';
import Incident, { INCIDENT_STATUSES } from '../models/Incident.js';
import { analyzeReport, AIServiceError } from '../services/aiService.js';
import { calculatePriorityScore } from '../services/priorityScore.js';
import {
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from '../services/aiIncidentSchema.js';

export const createIncident = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Expected a JSON object.',
      });
    }

    const { report, location, urgency, needs } = req.body;

    if (report === undefined || report === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: report',
      });
    }

    if (typeof report !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Field "report" must be a string',
      });
    }

    const trimmedReport = report.trim();
    if (trimmedReport.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Field "report" cannot be empty',
      });
    }

    if (trimmedReport.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Field "report" exceeds maximum length of 5000 characters',
      });
    }

    if (urgency !== undefined && urgency !== null) {
      if (typeof urgency !== 'string' || !URGENCY_LEVELS.includes(urgency.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid urgency level: "${urgency}". Allowed: ${URGENCY_LEVELS.join(', ')}`,
        });
      }
    }

    if (needs !== undefined && needs !== null) {
      if (!Array.isArray(needs)) {
        return res.status(400).json({
          success: false,
          message: 'Field "needs" must be an array of resource names',
        });
      }
      const invalidNeeds = needs.filter((n) => !REQUIRED_RESOURCES.includes(n));
      if (invalidNeeds.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid resources: ${invalidNeeds.join(', ')}. Allowed: ${REQUIRED_RESOURCES.join(', ')}`,
        });
      }
    }

    const aiResult = await analyzeReport(trimmedReport);

    if (aiResult.status === 'needs_manual_review') {
      return res.status(200).json({
        success: false,
        status: 'needs_manual_review',
        message: 'AI analysis requires manual review before this incident can be processed.',
      });
    }

    const aiData = aiResult.data;

    const { score, breakdown } = calculatePriorityScore(aiData);

    let finalResources = [...(aiData.requiredResources || [])];
    if (Array.isArray(needs)) {
      for (const item of needs) {
        if (!finalResources.includes(item)) {
          finalResources.push(item);
        }
      }
    }

    const resolvedLocation =
      typeof location === 'string' && location.trim().length > 0
        ? location.trim()
        : aiData.locationClue || '';

    const incident = new Incident({
      report: trimmedReport,
      reporter: req.user._id,
      category: aiData.category,
      severity: aiData.severity,
      peopleAffected: aiData.peopleAffected,
      injuries: aiData.injuries,
      urgency: aiData.urgency,
      location: resolvedLocation,
      locationClue: aiData.locationClue,
      requiredResources: finalResources,
      summary: aiData.summary,
      aiConfidence: aiData.confidence,
      priorityScore: score,
      priorityBreakdown: breakdown,
      status: 'reported',
    });

    await incident.save();

    return res.status(201).json({
      success: true,
      data: incident,
    });
  } catch (err) {
    if (err instanceof AIServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    console.error('[Incident Controller] Error creating incident:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating incident.',
    });
  }
};

export const getIncidents = async (req, res) => {
  try {
    const { sort } = req.query;
    let sortOptions = { priorityScore: -1, createdAt: -1 };
    if (sort === 'date' || sort === 'createdAt' || sort === 'newest') {
      sortOptions = { createdAt: -1 };
    } else if (sort === 'priority') {
      sortOptions = { priorityScore: -1, createdAt: -1 };
    }

    const incidents = await Incident.find()
      .sort(sortOptions)
      .populate('reporter', 'name email role');

    return res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents,
    });
  } catch (err) {
    console.error('[Incident Controller] Error getting incidents:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching incidents.',
    });
  }
};

export const getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID format.',
      });
    }

    const incident = await Incident.findById(id).populate('reporter', 'name email role');

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (err) {
    console.error('[Incident Controller] Error getting incident by ID:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching incident.',
    });
  }
};

export const updateIncident = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid incident ID format.',
      });
    }

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body.',
      });
    }

    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found.',
      });
    }

    const { status, location, urgency, requiredResources, needs } = req.body;

    if (status !== undefined) {
      if (!INCIDENT_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status: "${status}". Allowed: ${INCIDENT_STATUSES.join(', ')}`,
        });
      }
      incident.status = status;
    }

    if (location !== undefined) {
      if (typeof location !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Location must be a string.',
        });
      }
      incident.location = location.trim();
    }

    if (urgency !== undefined) {
      const lowerUrgency = typeof urgency === 'string' ? urgency.toLowerCase() : '';
      if (!URGENCY_LEVELS.includes(lowerUrgency)) {
        return res.status(400).json({
          success: false,
          message: `Invalid urgency: "${urgency}". Allowed: ${URGENCY_LEVELS.join(', ')}`,
        });
      }
      incident.urgency = lowerUrgency;
    }

    const resList = requiredResources || needs;
    if (resList !== undefined) {
      if (!Array.isArray(resList)) {
        return res.status(400).json({
          success: false,
          message: 'Required resources must be an array.',
        });
      }
      const invalid = resList.filter((r) => !REQUIRED_RESOURCES.includes(r));
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid resources: ${invalid.join(', ')}. Allowed: ${REQUIRED_RESOURCES.join(', ')}`,
        });
      }
      incident.requiredResources = resList;
    }

    await incident.save();

    return res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (err) {
    console.error('[Incident Controller] Error updating incident:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating incident.',
    });
  }
};

export default {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
};
