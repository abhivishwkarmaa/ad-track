export class OfferParamsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async setOfferParams(offerId, tenantId, params = []) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Delete existing params for this offer
      await connection.query(
        "DELETE FROM offer_params WHERE offer_id = ? AND tenant_id = ?",
        [offerId, tenantId],
      );

      // Insert new params
      if (params && params.length > 0) {
        const values = params.map((p) => [
          offerId,
          tenantId,
          p.param_key,
          p.is_required || false,
          p.default_value || null,
        ]);

        await connection.query(
          `INSERT INTO offer_params (offer_id, tenant_id, param_key, is_required, default_value) 
           VALUES ?`,
          [values],
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getOfferParams(offerId, tenantId) {
    const [rows] = await this.pool.query(
      `SELECT param_key, is_required, default_value 
       FROM offer_params 
       WHERE offer_id = ? AND tenant_id = ?
       ORDER BY param_key`,
      [offerId, tenantId],
    );
    return rows;
  }
}
