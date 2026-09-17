export function logValidationFailure({ attempt, errors, parseError }) {
  const timestamp = new Date().toISOString();

  if (parseError) {
    console.error(
      JSON.stringify({
        event: 'AI_VALIDATION_FAILURE',
        timestamp,
        attempt,
        field: 'response',
        type: 'parse_error',
        error: parseError,
      })
    );
    return;
  }

  if (!errors || errors.length === 0) return;

  for (const err of errors) {
    console.error(
      JSON.stringify({
        event: 'AI_VALIDATION_FAILURE',
        timestamp,
        attempt,
        field: err.field || 'unknown',
        type: err.type || 'unknown',
        error: err.error || 'Unknown validation error',
      })
    );
  }
}

export function logManualReviewFallback(totalAttempts) {
  console.error(
    JSON.stringify({
      event: 'AI_MANUAL_REVIEW_FALLBACK',
      timestamp: new Date().toISOString(),
      totalAttempts,
      message: 'AI analysis failed validation after all attempts. Falling back to manual review.',
    })
  );
}

export default { logValidationFailure, logManualReviewFallback };
