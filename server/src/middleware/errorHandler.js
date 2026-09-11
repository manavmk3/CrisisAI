import config from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || err.status || 500);

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


