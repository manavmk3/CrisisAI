import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/env.js';
import { buildIncidentAnalysisPrompt } from './aiPrompt.service.js';
import { safeParseJSON, validateAIOutput } from './aiIncidentSchema.js';

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

export async function analyzeReport(reportText) {
  const prompt = buildIncidentAnalysisPrompt(reportText);

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  let rawText;
  try {
    const result = await model.generateContent(prompt);
    rawText = result.response.text();
  } catch (err) {
    throw classifyGeminiError(err);
  }

  const { parsed, error: parseError } = safeParseJSON(rawText);

  if (parseError || !parsed) {
    console.error('[AI Service] Failed to parse AI response:', parseError);
    throw new AIServiceError(
      'AI returned a malformed response. Please try again.',
      502,
      'AI_PARSE_ERROR'
    );
  }

  const { valid, errors, sanitized } = validateAIOutput(parsed);

  if (!valid) {
    console.error('[AI Service] AI response failed schema validation:', errors);
    throw new AIServiceError(
      'AI response did not match the expected schema. Please try again.',
      502,
      'AI_VALIDATION_ERROR'
    );
  }

  return sanitized;
}

export default { analyzeReport, AIServiceError };
