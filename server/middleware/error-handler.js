const logger = require('../logger');

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// Wrap async route handlers to catch errors
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Central error handling middleware (must be registered last)
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.code === 'ENOENT' ? 404 : 500;
  const code = err.code && typeof err.code === 'string' && err.code !== 'ENOENT'
    ? err.code
    : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';

  const response = {
    error: err.message || 'Internal server error',
    code
  };

  if (err.details) {
    response.details = err.details;
  }

  if (err.policy) {
    response.policy = err.policy;
  }

  // Only log server errors at error level; client errors at warn
  if (statusCode >= 500) {
    logger.error('http', `${req.method} ${req.originalUrl} -> ${statusCode}`, err);
  } else {
    logger.warn('http', `${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
  }

  res.status(statusCode).json(response);
}

module.exports = { AppError, asyncHandler, errorHandler };
