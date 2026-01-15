/**
 * Tenant Scoping Utilities
 * 
 * Helper functions to ensure all database queries are scoped by tenant_id
 */

/**
 * Get tenant_id from request context
 * @param {Object} request - Fastify request object
 * @returns {number|null} - Tenant ID or null
 */
export function getTenantIdFromRequest(request) {
  return request.tenantId || request.tenant?.id || request.admin?.tenantId || request.query?.tenant_id || null;
}

/**
 * Add tenant_id condition to WHERE clause
 * @param {string} whereClause - Existing WHERE clause (e.g., "WHERE id = ?")
 * @param {number|null} tenantId - Tenant ID to scope by
 * @param {Array} params - Existing query parameters array
 * @returns {Object} - { where: string, params: Array }
 */
export function addTenantScope(whereClause, tenantId, params = []) {
  if (!tenantId) {
    // If no tenant_id, return as-is (for super admin queries or admin subdomain)
    return { where: whereClause, params };
  }

  // Add tenant_id condition
  const hasWhere = whereClause.trim().toUpperCase().startsWith('WHERE');
  const newWhere = hasWhere
    ? `${whereClause} AND tenant_id = ?`
    : `WHERE tenant_id = ? ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, '')}` : ''}`;

  return {
    where: newWhere,
    params: [...params, tenantId]
  };
}

/**
 * Build tenant-scoped query
 * @param {string} baseQuery - Base SQL query (e.g., "SELECT * FROM offers")
 * @param {string} whereClause - WHERE clause (e.g., "WHERE id = ?")
 * @param {number|null} tenantId - Tenant ID
 * @param {Array} params - Query parameters
 * @returns {Object} - { query: string, params: Array }
 */
export function buildTenantScopedQuery(baseQuery, whereClause, tenantId, params = []) {
  const { where, params: scopedParams } = addTenantScope(whereClause, tenantId, params);
  return {
    query: `${baseQuery} ${where}`,
    params: scopedParams
  };
}
