/**
 * Secure Error Handling Utilities
 * 
 * 🔒 PRODUCTION-GRADE ERROR HANDLING
 * 
 * This module provides secure error handling that:
 * - Returns minimal responses to clients (no internal details)
 * - Logs full diagnostic details server-side
 * - Differentiates between tracking endpoints (public) and API endpoints (internal)
 * - Respects environment (production vs development)
 */

import logger from './logger.js';

/**
 * Custom Error Classes
 */
export class TenantNotFoundError extends Error {
  constructor(message = 'Tenant not found', subdomain = null) {
    super(message);
    this.name = 'TenantNotFoundError';
    this.statusCode = 404;
    this.subdomain = subdomain;
    this.isPublic = false; // Never expose tenant details
  }
}

export class TenantSuspendedError extends Error {
  constructor(message = 'Tenant suspended', tenantSlug = null) {
    super(message);
    this.name = 'TenantSuspendedError';
    this.statusCode = 403;
    this.tenantSlug = tenantSlug;
    this.isPublic = false; // Never expose tenant details
  }
}

export class TenantRequiredError extends Error {
  constructor(message = 'Tenant required') {
    super(message);
    this.name = 'TenantRequiredError';
    this.statusCode = 400;
    this.isPublic = false; // Never expose tenant resolution logic
  }
}

export class ValidationError extends Error {
  constructor(message = 'Validation failed', details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
    this.isPublic = true; // Can show validation errors to users
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found', resource = null) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.resource = resource;
    this.isPublic = true; // Can show "not found" to users
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.isPublic = true; // Can show auth errors to users
  }
}

/**
 * Determine if request is to a tracking endpoint
 */
export function isTrackingEndpoint(url) {
  if (!url) return false;
  const trackingPaths = ['/click', '/imp', '/postback'];
  return trackingPaths.some(path => url.startsWith(path));
}

/**
 * Determine if request is to an API endpoint
 */
export function isApiEndpoint(url) {
  if (!url) return false;
  return url.startsWith('/api/');
}

/**
 * Get endpoint type for error handling
 */
export function getEndpointType(url) {
  if (isTrackingEndpoint(url)) {
    return 'tracking';
  }
  if (isApiEndpoint(url)) {
    return 'api';
  }
  return 'unknown';
}

/**
 * Create minimal error response for tracking endpoints
 * 
 * Tracking endpoints are public-facing and must return minimal responses
 * to prevent information leakage.
 */
export function createTrackingErrorResponse(error, request) {
  // Always return minimal response for tracking endpoints
  // No internal details, no hints, no error types
  
  const statusCode = error.statusCode || 400;
  
  // For tracking endpoints, return minimal JSON or empty response
  if (statusCode >= 500) {
    // Server errors: return minimal response
    return {
      success: false
    };
  }
  
  // Client errors: return minimal response
  return {
    success: false
  };
}

/**
 * Create clean error response for API endpoints
 * 
 * API endpoints can return user-friendly messages but must not expose:
 * - Internal paths
 * - Available endpoints
 * - Tenant resolution logic
 * - Stack traces (in production)
 */
export function createApiErrorResponse(error, request) {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Base response
  const response = {
    success: false,
    message: null
  };
  
  // Set user-friendly message based on error type
  if (error instanceof TenantNotFoundError) {
    response.message = 'Not found';
  } else if (error instanceof TenantSuspendedError) {
    response.message = 'Access denied';
  } else if (error instanceof TenantRequiredError) {
    response.message = 'Invalid request';
  } else if (error instanceof ValidationError) {
    response.message = error.message || 'Validation failed';
    // Only include validation details in development
    if (!isProduction && error.details) {
      response.details = error.details;
    }
  } else if (error instanceof NotFoundError) {
    response.message = error.message || 'Not found';
  } else if (error instanceof UnauthorizedError) {
    response.message = error.message || 'Unauthorized';
  } else if (statusCode >= 500) {
    // Server errors: generic message
    response.message = isProduction 
      ? 'An error occurred. Please try again later.'
      : error.message || 'Internal server error';
  } else {
    // Client errors: show message if safe
    response.message = error.message || 'Invalid request';
  }
  
  return response;
}

/**
 * Create error response based on endpoint type
 */
export function createSecureErrorResponse(error, request) {
  const endpointType = getEndpointType(request.url);
  
  if (endpointType === 'tracking') {
    return createTrackingErrorResponse(error, request);
  } else if (endpointType === 'api') {
    return createApiErrorResponse(error, request);
  } else {
    // Unknown endpoint: default to minimal
    return {
      success: false
    };
  }
}

/**
 * Log error with full diagnostic details (server-side only)
 */
export function logErrorWithDetails(error, request) {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = request.url;
  const host = request.headers.host;
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'N/A';
  const tenantId = request.tenantId || null;
  const tenantSlug = request.tenant?.slug || null;
  
  // Build diagnostic object
  const diagnostics = {
    timestamp,
    method,
    url,
    host,
    ip,
    userAgent: userAgent.substring(0, 200), // Limit length
    tenantId,
    tenantSlug,
    errorType: error.constructor.name,
    errorName: error.name,
    statusCode: error.statusCode || 500,
    message: error.message,
    stack: error.stack ? error.stack.split('\n').slice(0, 10) : null,
    code: error.code || null,
    validation: error.validation || null,
    details: error.details || null
  };
  
  // Log with appropriate level
  if (error.statusCode >= 500) {
    logger.error('Server Error - Full Diagnostics:', diagnostics);
  } else if (error.statusCode >= 400) {
    logger.warn('Client Error - Full Diagnostics:', diagnostics);
  } else {
    logger.info('Error - Full Diagnostics:', diagnostics);
  }
  
  return diagnostics;
}
