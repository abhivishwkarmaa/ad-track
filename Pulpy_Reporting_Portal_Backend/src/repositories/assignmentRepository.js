export class AssignmentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAssignmentByPublicIdWithJoins({
    tenantId,
    publicAssignmentId,
  }) {
    const poFields =
      "po.id, po.publisher_id, po.offer_id, po.tenant_id, po.public_assignment_id, po.status, po.payout_override, po.payout_override, po.cap_override, po.callback_url, po.destination_url, po.assigned_at, po.updated_at";
    const [rows] = await this.pool.query(
      `SELECT ${poFields},
              p.email as publisher_email, p.company_name as publisher_company, p.public_publisher_id,
              o.name as offer_name, o.category as offer_category, o.public_offer_id,
              o.affiliate_amount as offer_affiliate_amount
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.public_assignment_id = ? AND po.tenant_id = ?
       LIMIT 1`,
      [publicAssignmentId, tenantId],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAssignmentByInternalIdWithJoins({ id, tenantId }) {
    const poFields =
      "po.id, po.publisher_id, po.offer_id, po.tenant_id, po.public_assignment_id, po.status, po.payout_override, po.cap_override, po.callback_url, po.destination_url, po.assigned_at, po.updated_at";
    let query = `SELECT ${poFields},
              p.email as publisher_email, p.company_name as publisher_company, p.public_publisher_id,
              o.name as offer_name, o.category as offer_category, o.public_offer_id,
              o.affiliate_amount as offer_affiliate_amount
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.id = ?`;
    const params = [id];
    if (tenantId) {
      query += " AND po.tenant_id = ?";
      params.push(tenantId);
    }
    query += " LIMIT 1";

    const [rows] = await this.pool.query(query, params);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAssignments({ tenantId, publisherId, offerId, status }) {
    const poFields =
      "po.id, po.publisher_id, po.offer_id, po.tenant_id, po.public_assignment_id, po.status, po.payout_override, po.cap_override, po.callback_url, po.destination_url, po.assigned_at, po.updated_at";
    let query = `
      SELECT ${poFields},
             p.email as publisher_email, p.company_name as publisher_company, p.public_publisher_id,
             o.name as offer_name, o.category as offer_category, o.public_offer_id,
             o.affiliate_amount as offer_affiliate_amount
      FROM publisher_offers po
      JOIN publishers p ON po.publisher_id = p.id
      JOIN offers o ON po.offer_id = o.id
      WHERE po.tenant_id = ?
    `;
    const params = [tenantId];

    if (publisherId) {
      query += ` AND po.publisher_id = ?`;
      params.push(publisherId);
    }
    if (offerId) {
      query += ` AND po.offer_id = ?`;
      params.push(offerId);
    }
    if (status) {
      query += ` AND po.status = ?`;
      params.push(status);
    }

    query += " ORDER BY po.assigned_at DESC";
    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async updateAssignmentById({
    id,
    tenantId,
    updateFields,
    updateValues,
  }) {
    if (!Array.isArray(updateFields) || updateFields.length === 0) {
      return { affectedRows: 0 };
    }
    const setClause = updateFields.join(", ");
    let query = `UPDATE publisher_offers SET ${setClause}, updated_at = UTC_TIMESTAMP() WHERE id = ?`;
    const params = [...updateValues, id];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const [result] = await this.pool.query(query, params);
    return result;
  }

  async deleteAssignmentById({ id, tenantId }) {
    let query = `DELETE FROM publisher_offers WHERE id = ?`;
    const params = [id];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const [result] = await this.pool.query(query, params);
    return result;
  }

  async upsertPublisherOfferAssignment({
    publisherId,
    offerId,
    tenantId,
    publicAssignmentId,
    payoutOverride,
    conversionApprovalPercentage,
    cappingType,
    cappingDuration,
    cappingAction,
    fallbackType,
    fallbackUrl,
    fallbackOfferId,
    cappingBudgetDuration,
    cappingBudgetAmount,
    cappingConversionsDuration,
    cappingConversionsAmount,
    callbackUrl,
    destinationUrl,
    notes,
    status,
  }) {
    await this.pool.query(
      `INSERT INTO publisher_offers (
        publisher_id, offer_id, tenant_id, public_assignment_id, payout_override,
        conversion_approval_percentage,
        capping_type, capping_duration, capping_action,
        fallback_type, fallback_url, fallback_offer_id,
        capping_budget_duration, capping_budget_amount,
        capping_conversions_duration, capping_conversions_amount,
        callback_url, destination_url,
        notes, status, assigned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        payout_override = VALUES(payout_override),
        conversion_approval_percentage = VALUES(conversion_approval_percentage),
        capping_type = VALUES(capping_type),
        capping_duration = VALUES(capping_duration),
        capping_action = VALUES(capping_action),
        fallback_type = VALUES(fallback_type),
        fallback_url = VALUES(fallback_url),
        fallback_offer_id = VALUES(fallback_offer_id),
        capping_budget_duration = VALUES(capping_budget_duration),
        capping_budget_amount = VALUES(capping_budget_amount),
        capping_conversions_duration = VALUES(capping_conversions_duration),
        capping_conversions_amount = VALUES(capping_conversions_amount),
        callback_url = VALUES(callback_url),
        destination_url = VALUES(destination_url),
        notes = VALUES(notes),
        status = VALUES(status)`,
      [
        publisherId,
        offerId,
        tenantId,
        publicAssignmentId,
        payoutOverride ?? null,
        conversionApprovalPercentage ?? null,
        cappingType ?? null,
        cappingDuration ?? null,
        cappingAction ?? null,
        fallbackType ?? null,
        fallbackUrl ?? null,
        fallbackOfferId ?? null,
        cappingBudgetDuration ?? null,
        cappingBudgetAmount ?? null,
        cappingConversionsDuration ?? null,
        cappingConversionsAmount ?? null,
        callbackUrl ?? null,
        destinationUrl ?? null,
        notes ?? null,
        status ?? "active",
      ],
    );
  }

  async upsertLegacyAssignment({
    publisherId,
    offerId,
    tenantId,
    publicAssignmentId,
    payoutOverride,
    capOverride,
    callbackUrl,
    destinationUrl,
    notes,
    status,
  }) {
    await this.pool.query(
      `INSERT INTO publisher_offers (
        publisher_id, offer_id, tenant_id, public_assignment_id, payout_override, cap_override,
        callback_url, destination_url,
        notes, status, assigned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        payout_override = VALUES(payout_override),
        cap_override = VALUES(cap_override),
        callback_url = VALUES(callback_url),
        destination_url = VALUES(destination_url),
        notes = VALUES(notes),
        status = VALUES(status)`,
      [
        publisherId,
        offerId,
        tenantId,
        publicAssignmentId,
        payoutOverride ?? null,
        capOverride ?? null,
        callbackUrl ?? null,
        destinationUrl ?? null,
        notes ?? null,
        status ?? "active",
      ],
    );
  }

  async findAssignmentWithJoins({ publisherId, offerId, tenantId }) {
    const [rows] = await this.pool.query(
      `SELECT po.*,
              p.email as publisher_email, p.company_name as publisher_company, p.public_publisher_id,
              o.name as offer_name, o.category as offer_category, o.public_offer_id,
              o.affiliate_amount as offer_affiliate_amount
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.publisher_id = ? AND po.offer_id = ? AND po.tenant_id = ?
       LIMIT 1`,
      [publisherId, offerId, tenantId],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findAssignmentWithJoinsMinimal({
    publisherId,
    offerId,
    tenantId,
  }) {
    const [rows] = await this.pool.query(
      `SELECT po.*,
              p.email as publisher_email, p.company_name as publisher_company,
              o.name as offer_name, o.category as offer_category,
              o.affiliate_amount as offer_affiliate_amount
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.publisher_id = ? AND po.offer_id = ? AND po.tenant_id = ?
       LIMIT 1`,
      [publisherId, offerId, tenantId],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findInternalIdByPublicId({ tenantId, publicAssignmentId }) {
    const [rows] = await this.pool.query(
      "SELECT id FROM publisher_offers WHERE tenant_id = ? AND public_assignment_id = ? LIMIT 1",
      [tenantId, publicAssignmentId],
    );
    return rows?.[0]?.id ?? null;
  }

  async assignmentExistsById({ id }) {
    const [rows] = await this.pool.query(
      "SELECT id FROM publisher_offers WHERE id = ? LIMIT 1",
      [id],
    );
    return Array.isArray(rows) ? rows.length > 0 : Boolean(rows);
  }

  async updateAssignmentFieldsById({ id, fields, params }) {
    if (!Array.isArray(fields) || fields.length === 0) return { affectedRows: 0 };
    const sql = `UPDATE publisher_offers SET ${fields.join(", ")} WHERE id = ?`;
    const [result] = await this.pool.query(sql, [...params, id]);
    return result;
  }

  async findAssignmentByIdForOfferService({ id }) {
    const poFields =
      "po.id, po.publisher_id, po.offer_id, po.tenant_id, po.status, po.payout_override, po.cap_override, po.callback_url, po.destination_url, po.assigned_at";
    const [rows] = await this.pool.query(
      `SELECT ${poFields},
              p.id as publisher_id,
              p.email as publisher_email,
              p.first_name as publisher_first_name,
              p.company_name as publisher_company,
              p.country as publisher_country,
              p.status as publisher_status,
              o.id as offer_id,
              o.name as offer_name,
              o.status as offer_status
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.id = ?
       LIMIT 1`,
      [id],
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }
}
