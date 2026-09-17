import Joi from 'joi';
import {
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from './aiIncidentSchema.js';

export const aiOutputJoiSchema = Joi.object({
  category: Joi.string()
    .valid(...CATEGORIES)
    .required()
    .messages({
      'any.only': `Invalid category: "{{#value}}". Allowed: ${CATEGORIES.join(', ')}`,
      'any.required': 'Missing required field: category',
      'string.empty': 'Missing required field: category',
    }),

  severity: Joi.string()
    .valid(...SEVERITY_LEVELS)
    .required()
    .messages({
      'any.only': `Invalid severity: "{{#value}}". Allowed: ${SEVERITY_LEVELS.join(', ')}`,
      'any.required': 'Missing required field: severity',
      'string.empty': 'Missing required field: severity',
    }),

  urgency: Joi.string()
    .valid(...URGENCY_LEVELS)
    .required()
    .messages({
      'any.only': `Invalid urgency: "{{#value}}". Allowed: ${URGENCY_LEVELS.join(', ')}`,
      'any.required': 'Missing required field: urgency',
      'string.empty': 'Missing required field: urgency',
    }),

  peopleAffected: Joi.number()
    .integer()
    .min(0)
    .allow(null)
    .required()
    .messages({
      'number.base': 'Invalid peopleAffected: must be a non-negative integer or null.',
      'number.integer': 'Invalid peopleAffected: must be a non-negative integer or null.',
      'number.min': 'Invalid peopleAffected: must be a non-negative integer or null. Got {{#value}}.',
      'any.required': 'Missing required field: peopleAffected',
    }),

  injuries: Joi.number()
    .integer()
    .min(0)
    .allow(null)
    .required()
    .messages({
      'number.base': 'Invalid injuries: must be a non-negative integer or null.',
      'number.integer': 'Invalid injuries: must be a non-negative integer or null.',
      'number.min': 'Invalid injuries: must be a non-negative integer or null. Got {{#value}}.',
      'any.required': 'Missing required field: injuries',
    }),

  confidence: Joi.number()
    .min(0)
    .max(1)
    .required()
    .messages({
      'number.base': 'Invalid confidence: must be a number between 0 and 1.',
      'number.min': 'Invalid confidence: must be a number between 0 and 1. Got {{#value}}.',
      'number.max': 'Invalid confidence: must be a number between 0 and 1. Got {{#value}}.',
      'any.required': 'Missing required field: confidence',
    }),

  summary: Joi.string()
    .trim()
    .min(1)
    .required()
    .messages({
      'string.base': 'summary must be a non-empty string.',
      'string.empty': 'summary must be a non-empty string.',
      'string.min': 'summary must be a non-empty string.',
      'any.required': 'Missing required field: summary',
    }),

  locationClue: Joi.string()
    .trim()
    .allow(null)
    .required()
    .messages({
      'string.base': 'Invalid locationClue: must be a string or null.',
      'any.required': 'Missing required field: locationClue',
    }),

  requiredResources: Joi.array()
    .items(
      Joi.string()
        .valid(...REQUIRED_RESOURCES)
        .messages({
          'any.only': `Invalid resource: "{{#value}}". Allowed: ${REQUIRED_RESOURCES.join(', ')}`,
        })
    )
    .required()
    .messages({
      'array.base': 'requiredResources must be an array.',
      'any.required': 'Missing required field: requiredResources',
    }),
}).options({ stripUnknown: true });

export function formatValidationErrors(joiError) {
  if (!joiError || !joiError.details) return [];

  return joiError.details.map((detail) => ({
    field: detail.path.join('.') || 'unknown',
    type: detail.type || 'unknown',
    error: detail.message,
  }));
}

export function validateWithJoi(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      errors: [{ field: 'root', type: 'object.base', error: 'Output is not a valid JSON object.' }],
      sanitized: null,
    };
  }

  const { error, value } = aiOutputJoiSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return {
      valid: false,
      errors: formatValidationErrors(error),
      sanitized: null,
    };
  }

  return {
    valid: true,
    errors: [],
    sanitized: value,
  };
}

export default { aiOutputJoiSchema, validateWithJoi, formatValidationErrors };
