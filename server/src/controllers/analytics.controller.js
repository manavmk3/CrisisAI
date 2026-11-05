import analyticsService, { AnalyticsServiceError } from '../services/analytics.service.js';

export async function getOverview(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = analyticsService.parseDateFilter(startDate, endDate);
    const data = await analyticsService.getOverviewMetrics(dateFilter);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling overview metrics.',
    });
  }
}

export async function getSeverity(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = analyticsService.parseDateFilter(startDate, endDate);
    const data = await analyticsService.getSeverityDistribution(dateFilter);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling severity metrics.',
    });
  }
}

export async function getResources(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = analyticsService.parseDateFilter(startDate, endDate);
    const data = await analyticsService.getResourceDemandVsDeployment(dateFilter);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling resource metrics.',
    });
  }
}

export async function getResponseTimes(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = analyticsService.parseDateFilter(startDate, endDate);
    const data = await analyticsService.getAverageResponseTime(dateFilter);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling response time metrics.',
    });
  }
}

export async function getCategories(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = analyticsService.parseDateFilter(startDate, endDate);
    const data = await analyticsService.getCategoryDistribution(dateFilter);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling category metrics.',
    });
  }
}

export async function getDashboard(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const data = await analyticsService.getFullDashboardData(startDate, endDate);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AnalyticsServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while compiling analytics dashboard.',
    });
  }
}

export default {
  getOverview,
  getSeverity,
  getResources,
  getResponseTimes,
  getCategories,
  getDashboard,
};

