import { analyzeReport, AIServiceError } from '../services/aiService.js';

export const analyzeEmergencyReport = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected JSON with a "report" field.',
      });
    }

    const { report } = req.body;

    if (report === undefined || report === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: report',
      });
    }

    if (typeof report !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Field "report" must be a string',
      });
    }

    if (report.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Field "report" cannot be empty',
      });
    }

    const result = await analyzeReport(report);

    if (result.status === 'needs_manual_review') {
      return res.status(200).json({
        success: true,
        status: 'needs_manual_review',
        data: null,
        message: result.message || 'AI analysis could not be validated. Manual review is required.',
      });
    }

    return res.status(200).json({
      success: true,
      status: 'analyzed',
      data: result.data,
    });
  } catch (err) {
    if (err instanceof AIServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
    }

    console.error('[AI Controller] Unexpected error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while processing the report.',
    });
  }
};

export default { analyzeEmergencyReport };
