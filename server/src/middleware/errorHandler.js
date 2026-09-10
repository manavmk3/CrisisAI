import config from '../config/env.js';

/**
 * Centralized Error-Handling Middleware
 * Formats errors into a consistent JSON response and protects internal stack traces in production.
 */
export const errorHandler = (err, req, res, next) => {
  // Determine HTTP status code (if res.statusCode was not set or set to 200, default to 500)
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || err.status || 500);

  // Log error details for server diagnostics
  if (config.isDevelopment || statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
    if (config.isDevelopment && err.stack) {
      console.error(err.stack);
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode,
      ...(config.isDevelopment && { stack: err.stack }),
    },
  });
};

export default errorHandler;
