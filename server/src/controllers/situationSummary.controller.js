import situationSummaryService from '../services/situationSummary.service.js';

export async function getSituationSummary(req, res) {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const summary = await situationSummaryService.getSituationSummary({ forceRefresh });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Failed to retrieve situation summary.',
      code: err.code || 'SUMMARY_FETCH_ERROR',
    });
  }
}

export async function generateSituationSummary(req, res) {
  try {
    const summary = await situationSummaryService.getSituationSummary({ forceRefresh: true });

    return res.status(200).json({
      success: true,
      message: 'Fresh situation summary successfully generated from live operational records.',
      data: summary,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Failed to generate situation summary.',
      code: err.code || 'SUMMARY_GENERATION_ERROR',
    });
  }
}

export default {
  getSituationSummary,
  generateSituationSummary,
};

