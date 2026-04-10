import logger from '../utils/logger.js';


import { generateTrackingURL, generateAlternativeTrackingURL, generateClickId } from '../utils/urlGenerator.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';




export class AssignmentService {
  constructor(publisherService, offerService, offerPublicIdService, cacheService, assignmentRepository) {
    this.publisherService = publisherService;
    this.offerService = offerService;
    this.offerPublicIdService = offerPublicIdService;
    this.cacheService = cacheService;
    this.assignmentRepository = assignmentRepository;
  }

  async create(data, tenantId = null) {
    try {
      // ✅ CRITICAL: Require tenant_id for assignment creation
      if (!tenantId) {
        const err = new Error('Tenant context required to create assignment');
        err.statusCode = 400;
        throw err;
      }

      // Support both new multi-publisher format and legacy single-publisher format
      const isMultiPublisher = Array.isArray(data.publishers);

      if (isMultiPublisher) {
        return await this.createMultiple(data, tenantId);
      } else {
        return await this.createSingle(data, tenantId);
      }
    } catch (error) {
      logger.error('AssignmentService.create error:', error);
      throw error;
    }
  }

  async createMultiple(data, tenantId) {
    const { offer_id, publishers } = data;
    const baseURL = process.env.BASE_URL || process.env.TRACKING_BASE_URL || 'http://localhost:3000';
    const createdAssignments = [];
    const errors = [];

    // ✅ CRITICAL: Verify offer exists and belongs to tenant
    const offer = await this.offerService.getOfferById(offer_id, tenantId);
    if (!offer) {
      throw new Error(`Offer with id ${offer_id} not found or does not belong to this tenant`);
    }

    // Process each publisher assignment
    for (let i = 0; i < publishers.length; i++) {
      const pubData = publishers[i];

      try {
        // ✅ CRITICAL: Verify publisher exists and belongs to tenant
        const publisher = await this.publisherService.findById(pubData.publisher_id, tenantId);
        if (!publisher) {
          errors.push({
            index: i,
            publisher_id: pubData.publisher_id,
            error: `Publisher with id ${pubData.publisher_id} not found or does not belong to this tenant`,
          });
          continue;
        }

        // Store destination_url only if explicitly provided (override)
        // Do NOT generate tracking URLs - they are dynamic and generated at runtime
        const destinationUrl = pubData.destination_url || pubData.offer_url || null; // Support legacy field name
        const callbackUrl = pubData.callback_url || null; // Store only if explicitly provided (override)

        // Prepare capping data
        // Convert 'none' to null for DB enum compatibility
        const capType = (pubData.capping_type && pubData.capping_type !== 'none') ? pubData.capping_type : null;
        const capDuration = pubData.capping_duration || null;
        const capAction = pubData.capping_action || 'stop';
        const capAmount = pubData.capping_amount || 0;

        const fallbackType = capAction === 'fallback' ? (pubData.fallback_type || null) : null;
        const fallbackUrl = capAction === 'fallback' && pubData.fallback_type === 'custom'
          ? (pubData.fallback_url || null)
          : null;
        const fallbackOfferId = capAction === 'fallback' && pubData.fallback_type === 'offer' && pubData.fallback_offer_id
          ? parseInt(pubData.fallback_offer_id, 10)
          : null;

        let budgetAmount = null;
        let convAmount = null;

        if (capType === 'budget') budgetAmount = capAmount;
        if (capType === 'conversion') convAmount = capAmount;

        // Legacy compatibility: Sync legacy duration columns
        const cappingBudgetDuration = capType === 'budget' ? capDuration : null;
        const cappingConversionsDuration = capType === 'conversion' ? capDuration : null;

        // Generate stable public_assignment_id
        const publicAssignmentId = await this.offerPublicIdService.generatePublicAssignmentId(tenantId);

        // ✅ CRITICAL: Insert or update assignment with tenant_id
        await this.assignmentRepository.upsertPublisherOfferAssignment({
          publisherId: publisher.id,
          offerId: offer.id,
          tenantId,
          publicAssignmentId,
          payoutOverride: pubData.payout_override,
          conversionApprovalPercentage: pubData.conversion_approval_percentage,
          cappingType: capType,
          cappingDuration: capDuration,
          cappingAction: capAction,
          fallbackType,
          fallbackUrl,
          fallbackOfferId,
          cappingBudgetDuration,
          cappingBudgetAmount: budgetAmount,
          cappingConversionsDuration,
          cappingConversionsAmount: convAmount,
          callbackUrl,
          destinationUrl,
          notes: pubData.notes,
          status: pubData.status,
        });

        // ✅ CRITICAL: Fetch the created/updated assignment with tenant_id filtering
        const assignment = await this.assignmentRepository.findAssignmentWithJoinsMinimal({
          publisherId: publisher.id,
          offerId: offer.id,
          tenantId,
        });

        if (assignment) {
          createdAssignments.push(this.formatAssignment(assignment));
          // Invalidate cache
          await this.cacheService.invalidateAssignment(publisher.id, offer.id, tenantId);
        }
      } catch (error) {
        let errorMessage = error.message || 'Failed to create assignment';

        // Check if it's a database schema error (missing columns)
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('Unknown column')) {
          errorMessage = 'Database schema is outdated. Please update the database schema to match the current backend.';
          logger.error('AssignmentService.createMultiple: Database schema error - schema update required');
        }

        errors.push({
          index: i,
          publisher_id: pubData.publisher_id,
          error: errorMessage,
        });
        logger.error(`AssignmentService.createMultiple error for publisher ${pubData.publisher_id}:`, error);
      }
    }

    // If all failed, throw error
    if (createdAssignments.length === 0 && errors.length > 0) {
      throw new Error(`Failed to create assignments: ${errors.map(e => e.error).join('; ')}`);
    }

    return {
      assignments: createdAssignments,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async createSingle(data, tenantId) {
    // ✅ CRITICAL: Legacy single-publisher format support with tenant isolation
    const publisher = await this.publisherService.findById(data.publisher_id, tenantId);
    if (!publisher) {
      throw new Error('Publisher not found or does not belong to this tenant');
    }

    const offer = await this.offerService.getOfferById(data.offer_id, tenantId);
    if (!offer) {
      throw new Error('Offer not found or does not belong to this tenant');
    }

    // Store destination_url only if explicitly provided (override)
    // Do NOT generate tracking URLs - they are dynamic and generated at runtime
    const destinationUrl = data.destination_url || data.offer_url || null; // Support legacy field name
    const callbackUrl = data.callback_url || null; // Store only if explicitly provided (override)
    //https://url.promotrking.com/landing/subscribe?partner=Pulp&service=MadFunny-or&clickId=<CLICK_ID>
    // Generate stable public_assignment_id
    const publicAssignmentId = await this.offerPublicIdService.generatePublicAssignmentId(tenantId);

    // ✅ CRITICAL: Insert with tenant_id
    // Prepare capping data (legacy createSingle usually receives explicit fields or old structure, assume old structure for now or map if needed)
    // If strict new structure, map it. If createSingle is legacy, keep as minimal.
    // For now, let's just make it work with explicit fields if present, or legacy.

    await this.assignmentRepository.upsertLegacyAssignment({
      publisherId: publisher.id,
      offerId: offer.id,
      tenantId,
      publicAssignmentId,
      payoutOverride: data.payout_override,
      capOverride: data.cap_override,
      callbackUrl,
      destinationUrl,
      notes: data.notes,
      status: data.status,
    });

    // ✅ CRITICAL: Fetch with tenant_id filtering
    const assignment = await this.assignmentRepository.findAssignmentWithJoins({
      publisherId: publisher.id,
      offerId: offer.id,
      tenantId,
    });
    if (assignment) {
      await this.cacheService.invalidateAssignment(publisher.id, offer.id, tenantId);
    }
    return this.formatAssignment(assignment);
  }

  formatAssignment(assignment) {
    if (!assignment) return null;

    // Offer detail page "Share" section expects a payout even when assignment payout is NULL.
    // If assignment payout_override is NULL, fall back to offer's affiliate payout.
    const offerPayout = assignment.offer_affiliate_amount ?? null;
    const effectivePayoutOverride = (assignment.payout_override ?? offerPayout);

    return {
      id: assignment.public_assignment_id || assignment.id,
      internal_id: assignment.id,
      publisher_id: assignment.publisher_id, // 🔥 Return Internal ID to match Frontend List (which is keyed by Internal ID)
      public_publisher_id: assignment.public_publisher_id, // 🔥 Separate Public ID
      offer_id: assignment.offer_id, // 🔥 Return Internal ID
      public_offer_id: assignment.public_offer_id, // 🔥 Separate Public ID
      payout_override: effectivePayoutOverride,
      cap_override: assignment.cap_override,
      conversion_approval_percentage: assignment.conversion_approval_percentage,
      capping_type: assignment.capping_type,
      capping_duration: assignment.capping_duration,
      capping_action: assignment.capping_action,
      fallback_type: assignment.fallback_type,
      fallback_url: assignment.fallback_url,
      fallback_offer_id: assignment.fallback_offer_id,
      capping_amount: assignment.capping_type === 'budget'
        ? assignment.capping_budget_amount
        : (assignment.capping_type === 'conversion' ? assignment.capping_conversions_amount : null),
      // Keep legacy structure for backward compat if needed by frontend
      capping_budget: assignment.capping_budget_duration ? {
        duration: assignment.capping_budget_duration,
        amount: assignment.capping_budget_amount,
      } : null,
      capping_conversions: assignment.capping_conversions_duration ? {
        duration: assignment.capping_conversions_duration,
        amount: assignment.capping_conversions_amount,
      } : null,
      callback_url: assignment.callback_url,
      destination_url: assignment.destination_url,
      notes: assignment.notes,
      status: assignment.status,
      assigned_at: assignment.assigned_at,
      tenant_id: assignment.tenant_id,
      // Related data
      publisher_email: assignment.publisher_email,
      publisher_company: assignment.publisher_company,
      offer_name: assignment.offer_name,
      offer_category: assignment.offer_category,
    };
  }

  /**
   * Resolve public_assignment_id (from UI) to internal DB id using tenant + public id.
   * Backend receives public id; use this before any DB write/lookup by id.
   */
  async getInternalAssignmentIdByPublicId(publicAssignmentId, tenantId) {
    if (publicAssignmentId == null || !tenantId) return null;
    try {
      return await this.assignmentRepository.findInternalIdByPublicId({
        tenantId,
        publicAssignmentId,
      });
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') return null;
      throw e;
    }
  }

  async findById(id, tenantId = null, internalOnly = false) {
    if (id === undefined || id === null || id === '') return null;
    // Normalize id (route params can be string; ensure we don't pass path segments like "2/tracking-url")
    const idStr = String(id).trim();
    const idNum = Number(idStr);
    const numericId = Number.isInteger(idNum) ? idNum : idStr;

    // 1. Try Public ID first (unless strict internal lookup)
    if (tenantId && !internalOnly) {
      try {
        const assignment = await this.assignmentRepository.findAssignmentByPublicIdWithJoins({
          tenantId,
          publicAssignmentId: numericId,
        });
        if (assignment) {
          return this.formatAssignment(assignment);
        }
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          logger.warn('assignmentService.findById: public_assignment_id column missing, using internal id only');
        } else {
          throw err;
        }
      }
    }

    // 2. Fallback to internal ID (use numeric id for primary key lookup)
    const internalAssignment = await this.assignmentRepository.findAssignmentByInternalIdWithJoins({
      id: numericId,
      tenantId,
    });
    return internalAssignment ? this.formatAssignment(internalAssignment) : null;
  }

  async findByPublisherAndOffer(publisherId, offerId, tenantId) {
    const assignment = await this.assignmentRepository.findAssignmentWithJoins({
      publisherId,
      offerId,
      tenantId,
    });
    return this.formatAssignment(assignment);
  }

  async findAll(filters = {}, tenantId = null) {
    // ✅ CRITICAL: Require tenant_id for listing assignments
    if (!tenantId) {
      const err = new Error('Tenant context required to list assignments');
      err.statusCode = 400;
      throw err;
    }

    const rows = await this.assignmentRepository.findAssignments({
      tenantId,
      publisherId: filters.publisher_id,
      offerId: filters.offer_id,
      status: filters.status,
    });
    return rows.map(row => this.formatAssignment(row));
  }

  async generateTrackingURL(assignmentId, baseURL, format = 'standard', tenantId = null, overridePublicOfferId = null) {

    const assignment = await this.findById(assignmentId, tenantId);

    if (!assignment) {
      return null;
    }

    // 🔥 CRITICAL: Use internal IDs for DB lookups (assignment from formatAssignment has offer_id/publisher_id as public IDs)
    const internalOfferId = assignment.internal_offer_id ?? assignment.offer_id;
    const internalPublisherId = assignment.internal_publisher_id ?? assignment.publisher_id;

    // 🔥 CRITICAL: Fetch offer strictly by Internal ID to avoid Public ID collision
    const offer = await this.offerService.getOfferById(internalOfferId, tenantId, true);
    if (!offer) {
      logger.error('Offer not found for assignment', {
        assignment_id: assignmentId,
        internal_offer_id: internalOfferId,
        tenant_id: tenantId
      });
      return null;
    }

    // When called from offer detail page, use page's offer public id so tracking URL always shows correct offer_id
    const publicOfferId = overridePublicOfferId != null
      ? overridePublicOfferId
      : (offer.public_offer_id || offer.display_id || offer.id);
    if (!publicOfferId) {
      logger.error('Offer missing public identity', {
        offer_id: offer.id,
        offer_name: offer.name,
        tenant_id: tenantId
      });
      return null;
    }

    // 🔥 CRITICAL: Fetch publisher strictly by Internal ID
    const publisher = await this.publisherService.findById(internalPublisherId, tenantId, true);
    const publicPublisherId = publisher ? (publisher.public_publisher_id || publisher.id) : assignment.publisher_id;

    if (format === 'alternative') {
      const advertiserId = offer.advertiser_id;
      // Note: We might want public_advertiser_id here too if that's part of the spec?
      // User said "public id advertiser aur publisher ka bhi chahiye".
      // But `generateAlternativeTrackingURL` args depend on implementation. assuming it takes advertiserId.

      return generateAlternativeTrackingURL(
        baseURL,
        publicOfferId,  // 🔥 Use public_offer_id
        publicPublisherId, // 🔥 Use public_publisher_id
        advertiserId,
        { rcid: '{replace_it}' } // Use the format they specified
      );
    }

    // Default to standard format
    // Do NOT generate click_id upfront, but pass the placeholder.
    // This allows the UI to show {click_id} in the generated URL.

    return generateTrackingURL(
      baseURL,
      publicOfferId,  // 🔥 Use public_offer_id
      publicPublisherId, // 🔥 Use public_publisher_id
      { click_id: '{click_id}' }
    );
  }

  async getPayout(assignmentId, tenantId = null) {
    const assignment = await this.findById(assignmentId, tenantId);
    if (!assignment) {
      return null;
    }

    // If payout_override exists, use it; otherwise use offer's affiliate_model_cost
    if (assignment.payout_override) {
      return parseFloat(assignment.payout_override);
    }

    const offer = await this.offerService.getOfferById(assignment.offer_id, tenantId, true);
    return offer ? parseFloat(offer.affiliate_model_cost) : null;
  }

  async update(id, data, tenantId = null) {
    try {
      if (!tenantId) {
        const err = new Error('Tenant context required to update assignment');
        err.statusCode = 400;
        throw err;
      }

      // UI se public id aata hai → tenant + public id se internal id resolve karo, phir sab internal se
      const internalId = await this.getInternalAssignmentIdByPublicId(id, tenantId) ?? id;
      const existing = await this.findById(internalId, tenantId, true);
      if (!existing) {
        return null;
      }

      if (existing.tenant_id !== tenantId) {
        const err = new Error('Assignment does not belong to this tenant');
        err.statusCode = 403;
        throw err;
      }

      // Prepare update fields
      const updateFields = [];
      const updateValues = [];

      if (data.capping_type !== undefined) {
        updateFields.push('capping_type = ?');
        updateValues.push(data.capping_type === 'none' ? null : data.capping_type);

        if (data.capping_type === 'budget') {
          updateFields.push('capping_budget_duration = ?', 'capping_budget_amount = ?');
          // If type is budget, clear conversion fields? Or keep them?
          // Safer to clear or ignore. Let's set them.
          updateValues.push(data.capping_duration || null, data.capping_amount || 0);

          updateFields.push('capping_conversions_duration = ?', 'capping_conversions_amount = ?');
          updateValues.push(null, null);

        } else if (data.capping_type === 'conversion') {
          updateFields.push('capping_conversions_duration = ?', 'capping_conversions_amount = ?');
          updateValues.push(data.capping_duration || null, data.capping_amount || 0);

          updateFields.push('capping_budget_duration = ?', 'capping_budget_amount = ?');
          updateValues.push(null, null);
        } else {
          // Type is none/null
          updateFields.push('capping_budget_duration = ?', 'capping_budget_amount = ?', 'capping_conversions_duration = ?', 'capping_conversions_amount = ?');
          updateValues.push(null, null, null, null);
        }
      }

      if (data.capping_duration !== undefined) {
        updateFields.push('capping_duration = ?');
        updateValues.push(data.capping_duration);
      }
      if (data.capping_action !== undefined) {
        updateFields.push('capping_action = ?');
        updateValues.push(data.capping_action);
        if (data.capping_action !== 'fallback') {
          updateFields.push('fallback_type = ?', 'fallback_url = ?', 'fallback_offer_id = ?');
          updateValues.push(null, null, null);
        }
      }

      if (data.capping_action === undefined || data.capping_action === 'fallback') {
        if (data.fallback_type !== undefined) {
          updateFields.push('fallback_type = ?');
          updateValues.push(data.fallback_type);
        }
        if (data.fallback_url !== undefined) {
          updateFields.push('fallback_url = ?');
          updateValues.push(data.fallback_url || null);
        }
        if (data.fallback_offer_id !== undefined) {
          updateFields.push('fallback_offer_id = ?');
          updateValues.push(data.fallback_offer_id ?? null);
        }
      }

      // Legacy support (optional, if frontend sends old structure)
      if (data.capping_budget !== undefined && data.capping_type === undefined) {
        // If legacy params are sent without new type, map likely type 'budget'
        updateFields.push('capping_budget_duration = ?', 'capping_budget_amount = ?');
        updateValues.push(data.capping_budget?.duration || null, data.capping_budget?.amount || null);
      }
      if (data.capping_conversions !== undefined && data.capping_type === undefined) {
        updateFields.push('capping_conversions_duration = ?', 'capping_conversions_amount = ?');
        updateValues.push(data.capping_conversions?.duration || null, data.capping_conversions?.amount || null);
      }
      if (data.payout_override !== undefined) {
        updateFields.push('payout_override = ?');
        updateValues.push(data.payout_override ?? null);
      }
      if (data.conversion_approval_percentage !== undefined) {
        updateFields.push('conversion_approval_percentage = ?');
        updateValues.push(data.conversion_approval_percentage ?? null);
      }
      if (data.callback_url !== undefined) {
        updateFields.push('callback_url = ?');
        updateValues.push(data.callback_url || null);
      }
      if (data.destination_url !== undefined || data.offer_url !== undefined) {
        // Support both new field name and legacy field name
        const destinationUrl = data.destination_url !== undefined ? data.destination_url : data.offer_url;
        updateFields.push('destination_url = ?');
        updateValues.push(destinationUrl || null);
      }
      if (data.notes !== undefined) {
        updateFields.push('notes = ?');
        updateValues.push(data.notes || null);
      }
      if (data.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(data.status);
      }

      if (updateFields.length === 0) {
        return existing;
      }

      // DB me hamesha internal id se update (id = publisher_offers.id)
      const dbId = existing.internal_id ?? internalId;
      updateValues.push(dbId);

      await this.assignmentRepository.updateAssignmentById({
        id: dbId,
        tenantId,
        updateFields,
        updateValues,
      });

      logger.info(`Updated assignment (public id ${id}, internal ${dbId})`);

      await this.cacheService.invalidateAssignment(existing.internal_publisher_id || existing.publisher_id, existing.internal_offer_id || existing.offer_id, tenantId);

      return await this.findById(dbId, tenantId, true);
    } catch (error) {
      logger.error('AssignmentService.update error:', error);
      throw error;
    }
  }

  async delete(id, tenantId = null) {
    if (!tenantId) {
      const err = new Error('Tenant context required to delete assignment');
      err.statusCode = 400;
      throw err;
    }

    // UI se public id → tenant + public id se internal id resolve, phir delete internal se
    const internalId = await this.getInternalAssignmentIdByPublicId(id, tenantId) ?? id;
    const existing = await this.findById(internalId, tenantId, true);
    if (!existing) {
      return null;
    }

    if (existing.tenant_id !== tenantId) {
      const err = new Error('Assignment does not belong to this tenant');
      err.statusCode = 403;
      throw err;
    }

    const dbId = existing.internal_id ?? internalId;
    const result = await this.assignmentRepository.deleteAssignmentById({ id: dbId, tenantId });
    if (result.affectedRows === 0) {
      return null;
    }
    await this.cacheService.invalidateAssignment(existing.internal_publisher_id || existing.publisher_id, existing.internal_offer_id || existing.offer_id, tenantId);

    return existing;
  }
}

// (no singleton export)

