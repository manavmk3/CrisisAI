import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import ResourceAllocation from '../models/ResourceAllocation.js';
import Assignment from '../models/Assignment.js';
import {
  CATEGORIES,
  SEVERITY_LEVELS,
  REQUIRED_RESOURCES,
} from './aiIncidentSchema.js';

export class AnalyticsServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AnalyticsServiceError';
    this.statusCode = statusCode;
  }
}

export function parseDateFilter(startDateStr, endDateStr) {
  const filter = {};

  if (!startDateStr && !endDateStr) {
    return filter;
  }

  let startDate = null;
  let endDate = null;

  if (startDateStr) {
    startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      throw new AnalyticsServiceError('Invalid startDate parameter. Must be a valid ISO date.', 400);
    }
  }

  if (endDateStr) {
    endDate = new Date(endDateStr);
    if (isNaN(endDate.getTime())) {
      throw new AnalyticsServiceError('Invalid endDate parameter. Must be a valid ISO date.', 400);
    }
  }

  if (startDate && endDate && startDate > endDate) {
    throw new AnalyticsServiceError('startDate cannot be chronologically after endDate.', 400);
  }

  filter.createdAt = {};
  if (startDate) {
    filter.createdAt.$gte = startDate;
  }
  if (endDate) {
    filter.createdAt.$lte = endDate;
  }

  return filter;
}

export async function getActiveIncidentsCount(dateFilter = {}) {
  const matchStage = {
    ...dateFilter,
    status: { $in: ['reported', 'under_review', 'assigned'] },
  };

  const results = await Incident.aggregate([
    { $match: matchStage },
    { $count: 'activeCount' },
  ]);

  return results[0]?.activeCount || 0;
}

export async function getUnresolvedCasesCount(dateFilter = {}) {
  const matchStage = {
    ...dateFilter,
    status: { $nin: ['resolved', 'cancelled'] },
  };

  const results = await Incident.aggregate([
    { $match: matchStage },
    { $count: 'unresolvedCount' },
  ]);

  return results[0]?.unresolvedCount || 0;
}

export async function getTotalAffectedPopulation(dateFilter = {}) {
  const matchStage = {
    ...dateFilter,
    peopleAffected: { $gt: 0 },
  };

  const results = await Incident.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAffected: { $sum: '$peopleAffected' },
      },
    },
  ]);

  return results[0]?.totalAffected || 0;
}

export async function getSeverityDistribution(dateFilter = {}) {
  const matchStage = {
    ...dateFilter,
    severity: { $in: SEVERITY_LEVELS },
  };

  const results = await Incident.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 },
      },
    },
  ]);

  const map = {};
  for (const item of results) {
    if (item && item._id) {
      map[item._id] = item.count;
    }
  }

  return SEVERITY_LEVELS.map((sev) => ({
    severity: sev,
    count: map[sev] || 0,
  }));
}

export async function getCategoryDistribution(dateFilter = {}) {
  const matchStage = {
    ...dateFilter,
  };

  const results = await Incident.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
      },
    },
  ]);

  const map = {};
  for (const item of results) {
    if (item && item._id) {
      map[item._id] = item.count;
    }
  }

  return CATEGORIES.map((cat) => ({
    category: cat,
    count: map[cat] || 0,
  }));
}

export async function getResourceDemandVsDeployment(dateFilter = {}) {
  const incidentMatch = {
    ...dateFilter,
  };

  const demandResults = await Incident.aggregate([
    { $match: incidentMatch },
    { $unwind: '$requiredResources' },
    { $match: { requiredResources: { $in: REQUIRED_RESOURCES } } },
    {
      $group: {
        _id: '$requiredResources',
        demandCount: { $sum: 1 },
      },
    },
  ]);

  const demandMap = {};
  for (const item of demandResults) {
    if (item && item._id) {
      demandMap[item._id] = item.demandCount;
    }
  }

  const allocMatch = {
    ...dateFilter,
    status: 'active',
  };

  const deploymentResults = await ResourceAllocation.aggregate([
    { $match: allocMatch },
    {
      $group: {
        _id: '$resourceType',
        deployedQuantity: { $sum: '$quantity' },
        allocationsCount: { $sum: 1 },
      },
    },
  ]);

  const deploymentMap = {};
  for (const item of deploymentResults) {
    if (item && item._id) {
      deploymentMap[item._id] = item.deployedQuantity;
    }
  }

  return REQUIRED_RESOURCES.map((type) => {
    const demandCount = demandMap[type] || 0;
    const deployedQuantity = deploymentMap[type] || 0;
    const unmetDemand = Math.max(0, demandCount - deployedQuantity);

    return {
      resourceType: type,
      demandCount,
      deployedQuantity,
      unmetDemand,
    };
  });
}

export async function getAverageResponseTime(dateFilter = {}) {
  const matchStage = {
    acceptedAt: { $ne: null },
    ...dateFilter,
  };

  if (!matchStage.createdAt) {
    matchStage.createdAt = { $ne: null };
  }

  const results = await Assignment.aggregate([
    { $match: matchStage },
    {
      $project: {
        acceptedAt: 1,
        createdAt: 1,
        durationMinutes: {
          $divide: [{ $subtract: ['$acceptedAt', '$createdAt'] }, 60000],
        },
      },
    },
    {
      $match: {
        durationMinutes: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: null,
        avgMinutes: { $avg: '$durationMinutes' },
        recordsCount: { $sum: 1 },
        minMinutes: { $min: '$durationMinutes' },
        maxMinutes: { $max: '$durationMinutes' },
      },
    },
  ]);

  if (results.length === 0 || !results[0] || results[0].recordsCount === 0) {
    return {
      averageResponseTimeMinutes: null,
      recordsCount: 0,
      units: 'minutes',
    };
  }

  return {
    averageResponseTimeMinutes: Math.round(results[0].avgMinutes * 10) / 10,
    recordsCount: results[0].recordsCount,
    minMinutes: Math.round(results[0].minMinutes * 10) / 10,
    maxMinutes: Math.round(results[0].maxMinutes * 10) / 10,
    units: 'minutes',
  };
}

export async function getOverviewMetrics(dateFilter = {}) {
  const [activeIncidents, totalAffectedPopulation, unresolvedCases, responseStats] =
    await Promise.all([
      getActiveIncidentsCount(dateFilter),
      getTotalAffectedPopulation(dateFilter),
      getUnresolvedCasesCount(dateFilter),
      getAverageResponseTime(dateFilter),
    ]);

  return {
    activeIncidents,
    totalAffectedPopulation,
    unresolvedCases,
    averageResponseTimeMinutes: responseStats.averageResponseTimeMinutes,
    responseRecordsCount: responseStats.recordsCount,
    units: 'minutes',
  };
}

export async function getFullDashboardData(startDateStr, endDateStr) {
  const dateFilter = parseDateFilter(startDateStr, endDateStr);

  const [overview, severity, resources, categories, responseTime] =
    await Promise.all([
      getOverviewMetrics(dateFilter),
      getSeverityDistribution(dateFilter),
      getResourceDemandVsDeployment(dateFilter),
      getCategoryDistribution(dateFilter),
      getAverageResponseTime(dateFilter),
    ]);

  return {
    overview,
    severity,
    resources,
    categories,
    responseTime,
    filters: {
      startDate: startDateStr || null,
      endDate: endDateStr || null,
    },
  };
}

export default {
  parseDateFilter,
  getActiveIncidentsCount,
  getUnresolvedCasesCount,
  getTotalAffectedPopulation,
  getSeverityDistribution,
  getCategoryDistribution,
  getResourceDemandVsDeployment,
  getAverageResponseTime,
  getOverviewMetrics,
  getFullDashboardData,
  AnalyticsServiceError,
};
