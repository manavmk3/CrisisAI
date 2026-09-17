import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/env.js';
import { buildIncidentAnalysisPrompt } from './aiPrompt.service.js';
import { safeParseJSON } from './aiIncidentSchema.js';
import { validateWithJoi } from './aiOutputValidator.js';
import { buildCorrectionPrompt } from './aiCorrectionPrompt.js';
import { logValidationFailure, logManualReviewFallback } from './aiValidationLogger.js';

export class AIServiceError extends Error {
  constructor(message, statusCode = 500, code = 'AI_ERROR') {
    super(message);
    this.name = 'AIServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getGeminiClient() {
  const apiKey = config.ai?.geminiApiKey;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    throw new AIServiceError(
      'AI service is not configured. GEMINI_API_KEY is missing.',
      503,
      'AI_NOT_CONFIGURED'
    );
  }

  return new GoogleGenerativeAI(apiKey);
}

function classifyGeminiError(err) {
  const msg = err.message || '';

  if (msg.includes('429') || msg.includes('quota') || msg.includes('RATE_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
    return new AIServiceError(
      'AI service rate limit exceeded. Please try again later.',
      429,
      'AI_RATE_LIMIT'
    );
  }

  if (msg.includes('timeout') || msg.includes('DEADLINE_EXCEEDED') || err.code === 'ECONNABORTED') {
    return new AIServiceError(
      'AI service request timed out. Please try again.',
      504,
      'AI_TIMEOUT'
    );
  }

  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return new AIServiceError(
      'AI service temporarily unavailable. Please try again later.',
      503,
      'AI_UNAVAILABLE'
    );
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
    return new AIServiceError(
      'AI service authentication failed. Please check server configuration.',
      503,
      'AI_AUTH_FAILED'
    );
  }

  return new AIServiceError(
    'AI service encountered an unexpected error.',
    502,
    'AI_UNKNOWN_ERROR'
  );
}

async function callGemini(model, prompt) {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    throw classifyGeminiError(err);
  }
}

function parseAndValidate(rawText) {
  const { parsed, error: parseError } = safeParseJSON(rawText);

  if (parseError || !parsed) {
    return { valid: false, sanitized: null, errors: [], parseError: parseError || 'Empty response' };
  }

  const { valid, errors, sanitized } = validateWithJoi(parsed);
  return { valid, sanitized, errors, parseError: null };
}

export async function analyzeReport(reportText) {
  const prompt = buildIncidentAnalysisPrompt(reportText);

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  const rawText = await callGemini(model, prompt);
  const attempt1 = parseAndValidate(rawText);

  if (attempt1.valid) {
    return { status: 'analyzed', data: attempt1.sanitized };
  }

  logValidationFailure({
    attempt: 1,
    errors: attempt1.errors,
    parseError: attempt1.parseError,
  });

  const correctionErrors = attempt1.parseError
    ? [{ field: 'response', error: attempt1.parseError }]
    : attempt1.errors;

  const correctionPromptText = buildCorrectionPrompt(reportText, correctionErrors);

  let retryRawText;
  try {
    retryRawText = await callGemini(model, correctionPromptText);
  } catch (err) {
    logManualReviewFallback(2);
    return {
      status: 'needs_manual_review',
      data: null,
      message: 'AI analysis could not be validated. Manual review is required.',
    };
  }

  const attempt2 = parseAndValidate(retryRawText);

  if (attempt2.valid) {
    return { status: 'analyzed', data: attempt2.sanitized };
  }

  logValidationFailure({
    attempt: 2,
    errors: attempt2.errors,
    parseError: attempt2.parseError,
  });

  logManualReviewFallback(2);

  return {
    status: 'needs_manual_review',
    data: null,
    message: 'AI analysis could not be validated. Manual review is required.',
  };
}

export default { analyzeReport, AIServiceError };
