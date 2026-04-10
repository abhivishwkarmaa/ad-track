export class SubscriptionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getTenantForUpdate(tenantId, connection) {
    const [rows] = await connection.query(
      'SELECT id, slug, status, trial_start_at, trial_end_at, subscription_start_at, subscription_end_at FROM tenants WHERE id = ? FOR UPDATE',
      [tenantId]
    );
    return rows[0] || null;
  }

  async updateTenantTrial(tenantId, trialStartAt, trialEndAt, state, connection) {
    await connection.query(
      `UPDATE tenants 
       SET trial_start_at = ?, 
           trial_end_at = ?, 
           status = ?,
           updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [trialStartAt, trialEndAt, state, tenantId]
    );
  }

  async addHistory(data, connection) {
    const {
      tenant_id,
      action,
      previous_state,
      new_state,
      previous_end_at = null,
      new_end_at = null,
      admin_id = null,
      notes = null
    } = data;

    await connection.query(
      `INSERT INTO subscription_history 
       (tenant_id, action, previous_state, new_state, previous_end_at, new_end_at, admin_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant_id, action, previous_state, new_state, previous_end_at, new_end_at, admin_id, notes]
    );
  }

  async activateSubscription(tenantId, data, connection) {
    const {
      subscription_start_at,
      subscription_end_at,
      subscription_plan,
      billing_email,
      status
    } = data;

    await connection.query(
      `UPDATE tenants 
       SET subscription_start_at = ?, 
           subscription_end_at = ?, 
           subscription_plan = ?,
           billing_email = COALESCE(?, billing_email),
           status = ?,
           updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [subscription_start_at, subscription_end_at, subscription_plan, billing_email, status, tenantId]
    );
  }

  async updateTenantState(tenantId, newState, connection) {
    await connection.query(
        `UPDATE tenants 
         SET status = ?,
             updated_at = UTC_TIMESTAMP()
         WHERE id = ?`,
        [newState, tenantId]
    );
  }

  async getTenantSubscriptionDetails(tenantId) {
    const [rows] = await this.pool.query(
      `SELECT id, name, slug, status, 
              trial_start_at, trial_end_at, 
              subscription_start_at, subscription_end_at, subscription_plan,
              billing_email, created_at, updated_at
       FROM tenants WHERE id = ?`,
      [tenantId]
    );
    return rows[0] || null;
  }

  async getSubscriptionHistory(tenantId, limit = 50) {
    const [rows] = await this.pool.query(
        `SELECT sh.*, au.name as admin_name, au.email as admin_email
         FROM subscription_history sh
         LEFT JOIN admin_users au ON sh.admin_id = au.id
         WHERE sh.tenant_id = ? 
         ORDER BY sh.created_at DESC 
         LIMIT ?`,
        [tenantId, limit]
    );
    return rows;
  }
}
