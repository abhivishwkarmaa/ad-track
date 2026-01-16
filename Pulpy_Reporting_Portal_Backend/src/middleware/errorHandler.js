/**
 * 🔒 SECURE CENTRALIZED ERROR HANDLER
 * 
 * This error handler:
 * - Logs full diagnostic details server-side
 * - Returns minimal, secure responses to clients
 * - Differentiates between tracking endpoints (public) and API endpoints (internal)
 * - Never exposes internal architecture, routes, or tenant resolution logic
 */

import logger from '../utils/logger.js';
import {
  createSecureErrorResponse,
  logErrorWithDetails,
  isTrackingEndpoint,
  isApiEndpoint,
  TenantNotFoundError,
  TenantSuspendedError,
  TenantRequiredError,
  ValidationError,
  NotFoundError,
  UnauthorizedError
} from '../utils/secureErrors.js';

export async function errorHandler(error, request, reply) {
  // ✅ STEP 1: Log full diagnostic details (server-side only)
  const diagnostics = logErrorWithDetails(error, request);
  
  // ✅ STEP 2: Determine endpoint type
  const endpointType = isTrackingEndpoint(request.url) ? 'tracking' 
    : isApiEndpoint(request.url) ? 'api' 
    : 'unknown';
  
  // ✅ STEP 3: Get status code
  let statusCode = error.statusCode || 500;
  
  // Handle specific error types
  if (error.validation) {
    // Fastify validation errors
    statusCode = 400;
    const validationError = new ValidationError(
      'Validation failed',
      error.validation.map(err => ({
        field: err.instancePath || err.params?.key || err.params?.label || 'unknown',
        message: err.message,
      }))
    );
    error = validationError;
  } else if (error.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
  } else if (error.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
  } else if (error.code === '23502') { // PostgreSQL not null violation
    statusCode = 400;
  } else if (error.code === 'ER_DUP_ENTRY') { // MySQL duplicate entry
    statusCode = 409;
  } else if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    statusCode = 401;
    error = new UnauthorizedError(error.message || 'Invalid or expired token');
  }
  
  // ✅ STEP 4: Create secure response based on endpoint type
  const response = createSecureErrorResponse(error, request);
  
  // ✅ STEP 5: Send response
  return reply.code(statusCode).send(response);
}

