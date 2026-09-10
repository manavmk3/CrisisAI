/**
 * 404 Not Found Middleware
 * Intercepts requests that do not match any defined route.
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.method} ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export default notFound;
