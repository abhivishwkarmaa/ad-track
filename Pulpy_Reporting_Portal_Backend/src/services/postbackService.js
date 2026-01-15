import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import assignmentService from './assignmentService.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import { replaceMacros } from '../utils/urlGenerator.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import https from 'https';
import http from 'http';

import { clickQueue } from '../workers/clickQueue.js';
import redis from '../config/redis.js';

export class PostbackService {
  async processPostback(query, request) {
    try {
      const { click_id, rcid, amount, status = 'approved' } = query;

      if (!click_id && !rcid) {
        throw new Error('Either click_id or rcid is required');
      }

      // ============================================
      // REDIS FIRST CHECK
      // ============================================
      // Check if click exists in Redis (pending DB insert)
      if (click_id) {
        const redisClick = await redis.hgetall(`click:${click_id}`);
        if (redisClick && redisClick.offer_id) {
          // Click found in Redis! Process conversion in Redis.

          // 1. Rehydrate click data object
          const clickData = {
            ...redisClick,
            offer_id: parseInt(redisClick.offer_id),
            publisher_id: parseInt(redisClick.publisher_id),
            publisher_offer_id: parseInt(redisClick.publisher_offer_id || 0)
          };

          // 🔒 STRICT: Get tenant_id from subdomain (Host header) - EXCLUSIVE source
          const tenantId = getTenantIdFromRequest(request);
          if (!tenantId) {
            logger.error('❌ Postback rejected: No tenant subdomain', {
              host: request.headers.host,
              click_id: click_id,
              rcid: rcid
            });
            throw new Error('Tenant identity required from subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/postback).');
          }
          
          logger.info('[POSTBACK] Tenant resolved from subdomain', {
            tenant_id: tenantId,
            click_id: click_id,
            rcid: rcid
          });

          // 2. Validate Offer / Fetch Payout (using existing services with tenant_id)
          const offer = await offerService.getOfferById(clickData.offer_id, tenantId);
          if (!offer) throw new Error('Offer not found (Redis path)');

          // ✅ CRITICAL: Verify tenant ownership
          if (offer.tenant_id !== tenantId) {
            throw new Error('Offer does not belong to this tenant');
          }

          const offerValidation = offerService.checkOfferValidity(offer, true);
          if (!offerValidation.valid) {
            return { success: false, message: offerValidation.message, duplicate: false };
          }

          // 3. Get Assignment & Payout (with tenant_id filtering)
          let assignment = null;
          if (clickData.publisher_offer_id) {
            assignment = await assignmentService.findById(clickData.publisher_offer_id, tenantId);

            // ✅ CRITICAL: Verify assignment belongs to tenant
            // if (assignment && assignment.tenant_id !== tenantId) {
            //   throw new Error('Assignment does not belong to this tenant');
            // }
          }

          let payout = parseFloat(offer.affiliate_amount);
          if (assignment?.payout_override) payout = parseFloat(assignment.payout_override);
          const conversionAmount = amount ? parseFloat(amount) : payout;

          // 4. Status Determination
          let finalStatus = status;
          if (assignment?.conversion_approval_percentage) {
            const randomValue = Math.random() * 100;
            finalStatus = (randomValue <= parseFloat(assignment.conversion_approval_percentage)) ? 'approved' : 'pending';
          }

          // 5. Store Conversion in Redis - UTC ENFORCEMENT: Store UTC timestamp only
          // ✅ CRITICAL: Include tenant_id in conversion data
          const conversionData = {
            click_uuid: click_id,
            offer_id: clickData.offer_id,
            publisher_id: clickData.publisher_id,
            publisher_offer_id: clickData.publisher_offer_id,
            tenant_id: tenantId, // ✅ CRITICAL: Include tenant_id
            rcid: rcid || redisClick.rcid || uuidv4(),
            status: finalStatus,
            amount: conversionAmount,
            payout: payout,
            ip: extractIP(request),
            timestamp: new Date().toISOString(),
            postback_payload: JSON.stringify({ query, headers: request.headers })
          };

          // Save to Redis (Worker will pick this up after inserting the click)
          await redis.setex(`conversion:${click_id}`, 3600, JSON.stringify(conversionData));

          return {
            success: true,
            message: 'Conversion recorded (Buffered in Redis)',
            duplicate: false,
            note: 'Click handled via Redis buffer'
          };
        }
      }

      // NO REDIS MATCH? FALLBACK TO DB LOGIC BELOW...

      // 🔒 STRICT: Get tenant_id from subdomain (Host header) - EXCLUSIVE source
      const tenantId = getTenantIdFromRequest(request);
      
      if (!tenantId) {
        logger.error('❌ Postback rejected: No tenant subdomain', {
          host: request.headers.host,
          click_id: click_id,
          rcid: rcid
        });
        throw new Error('Tenant identity required from subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/postback).');
      }

      // Find click if click_id provided (WITH tenant filtering)
      let click = null;
      if (click_id) {
        // RETRY LOGIC: Handle async queue lag (race condition)
        // If postback arrives before click insert commit, retry a few times.
        let attempts = 0;
        while (attempts < 5) {
          // ✅ STRICT: Always filter by tenant_id (from subdomain)
          const query = 'SELECT * FROM clicks WHERE click_uuid = ? AND tenant_id = ?';
          const params = [click_id, tenantId];

          const [clickRows] = await pool.query(query, params);
          click = Array.isArray(clickRows) ? clickRows[0] : clickRows;

          if (click) {
            // ✅ Validate click belongs to resolved tenant
            if (click.tenant_id && parseInt(click.tenant_id) !== parseInt(tenantId)) {
              logger.error('❌ HARD FAILURE: Click tenant mismatch', {
                click_id: click_id,
                click_tenant_id: click.tenant_id,
                resolved_tenant_id: tenantId
              });
              throw new Error(`Security violation: Click ${click_id} belongs to tenant ${click.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
            }
            break; // Found it!
          }

          // Wait 200ms before retry
          attempts++;
          if (attempts < 5) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        if (!click) {
          // Check if queue has backend pressure, but since we use Redis now, 
          // a missing click means it's truly missing (or Redis evicted it and DB write failed?)
          // We will stick to standard logic: if not in Redis and not in DB, it's invalid.
          throw new Error('Click not found');
        }
      }

      // ✅ Tenant_id already resolved from subdomain - no fallback needed
      // If we reach here without tenantId, it's a system error
      if (!tenantId) {
        logger.error('❌ CRITICAL: No tenant_id after validation - system error');
        throw new Error('Tenant identity required from subdomain. This error indicates a system failure.');
      }
      
      // ✅ Validate click belongs to resolved tenant (if click exists)
      if (click && click.tenant_id && parseInt(click.tenant_id) !== parseInt(tenantId)) {
        logger.error('❌ HARD FAILURE: Click tenant mismatch', {
          click_id: click.click_uuid,
          click_tenant_id: click.tenant_id,
          resolved_tenant_id: tenantId
        });
        throw new Error(`Security violation: Click belongs to tenant ${click.tenant_id}, but request is for tenant ${tenantId}. Access denied.`);
      }

      // If rcid provided, check for existing conversion (dedupe)
      if (rcid) {
        const [existingRows] = await pool.query(
          'SELECT * FROM conversions WHERE rcid = ? AND offer_id = ? AND tenant_id = ?',
          [rcid, click ? click.offer_id : null, tenantId]
        );

        if (existingRows && existingRows.length > 0) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated)',
            conversion: existingRows[0],
            duplicate: true,
          };
        }
      }

      if (!click && !rcid) {
        throw new Error('Cannot process postback without click_id or rcid');
      }

      // Get offer and assignment
      let offerId = click ? click.offer_id : null;

      // If no offerId from click, try to find it from rcid (check previous conversion or click)
      if (!offerId && rcid) {
        // Try to find from existing conversion (scoped by tenant)
        const [convRows] = await pool.query(
          'SELECT offer_id FROM conversions WHERE rcid = ? AND tenant_id = ? LIMIT 1',
          [rcid, tenantId]
        );
        if (convRows && convRows.length > 0) {
          offerId = convRows[0].offer_id;
        } else {
          // Try to find from click with this rcid (scoped by tenant)
          const [clickRows] = await pool.query(
            'SELECT offer_id FROM clicks WHERE rcid = ? AND tenant_id = ? LIMIT 1',
            [rcid, tenantId]
          );
          if (clickRows && clickRows.length > 0) {
            offerId = clickRows[0].offer_id;
          }
        }
      }

      if (!offerId) {
        throw new Error('Offer ID not found. Cannot determine offer from click_id or rcid');
      }

      // ✅ CRITICAL: Get offer with tenant_id filtering
      const offer = await offerService.getOfferById(offerId, tenantId);
      if (!offer) {
        throw new Error('Offer not found or does not belong to this tenant');
      }

      // ✅ CRITICAL: Verify tenant ownership
      if (offer.tenant_id !== tenantId) {
        throw new Error('Offer does not belong to this tenant');
      }

      // Validate offer is active and not expired before processing conversion
      // Pass checkTimeRestrictions=true for conversions
      const offerValidation = offerService.checkOfferValidity(offer, true);
      if (!offerValidation.valid) {
        return {
          success: false,
          message: offerValidation.message,
          error_type: offerValidation.error_type,
          conversion: null,
          duplicate: false,
        };
      }

      const publisherId = click ? click.publisher_id : null;
      const publisherOfferId = click ? click.publisher_offer_id : null;

      // ✅ CRITICAL: Get assignment with tenant_id filtering
      let assignment = null;
      if (publisherOfferId) {
        assignment = await assignmentService.findById(publisherOfferId, tenantId);

        // ✅ CRITICAL: Verify assignment belongs to tenant
        // if (assignment && assignment.tenant_id !== tenantId) {
        //   throw new Error('Assignment does not belong to this tenant');
        // }
      }

      // Get payout (use assignment payout_override if available, otherwise offer affiliate_amount)
      let payout = parseFloat(offer.affiliate_amount);
      if (assignment?.payout_override) {
        payout = parseFloat(assignment.payout_override);
      }

      // Use provided amount or default to payout
      const conversionAmount = amount ? parseFloat(amount) : payout;

      // Determine conversion status based on conversion_approval_percentage
      let finalStatus = status;
      if (assignment?.conversion_approval_percentage !== null && assignment?.conversion_approval_percentage !== undefined) {
        const approvalPercentage = parseFloat(assignment.conversion_approval_percentage);
        // Random percentage check for auto-approval
        const randomValue = Math.random() * 100;
        if (randomValue <= approvalPercentage) {
          finalStatus = 'approved';
        } else {
          finalStatus = 'pending';
        }
      }

      // Extract IP
      const ip = extractIP(request);

      // Store postback payload - UTC ENFORCEMENT: Store UTC timestamp only
      const postbackPayload = {
        query: query,
        headers: request.headers,
        timestamp: new Date().toISOString(),
      };

      // ✅ CRITICAL: Check assignment-level capping (budget) with tenant_id
      if (assignment && await this.isAssignmentBudgetCapHit(assignment, offerId, publisherId, tenantId)) {
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            tenantId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );
        return {
          success: false,
          message: 'Conversion rejected due to assignment budget cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // ✅ CRITICAL: Check assignment-level capping (conversions) with tenant_id
      if (assignment && await this.isAssignmentConversionCapHit(assignment, offerId, publisherId, tenantId)) {
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            tenantId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );
        return {
          success: false,
          message: 'Conversion rejected due to assignment conversion cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // ✅ CRITICAL: Cap checks before inserting conversion (offer-level) with tenant_id
      const capExceeded = await this.isCapExceeded(offer, tenantId);
      if (capExceeded) {
        // Insert rejected_cap record (no payout, no stats)
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            tenantId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );

        return {
          success: false,
          message: 'Conversion rejected due to cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // Insert conversion
      const conversionUuid = uuidv4();
      const [insertResult] = await pool.query(
        `INSERT INTO conversions (
          conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
          rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          conversionUuid,
          click ? click.click_uuid : null,
          offerId,
          publisherId,
          publisherOfferId,
          tenantId,
          rcid || click?.rcid || uuidv4(),
          finalStatus,
          conversionAmount,
          payout,
          ip,
          JSON.stringify(postbackPayload),
        ]
      );

      const insertId = insertResult.insertId || insertResult[0]?.insertId;
      // ✅ CRITICAL: Fetch conversion with tenant_id filtering
      const [convRows] = await pool.query('SELECT * FROM conversions WHERE id = ? AND tenant_id = ?', [insertId, tenantId]);
      const conversion = Array.isArray(convRows) ? convRows[0] : convRows;

      // Update daily stats
      await this.updateDailyStats(offerId, conversionAmount, payout);

      // ✅ CRITICAL: Get publisher with tenant_id filtering
      let publisher = null;
      if (publisherId) {
        publisher = await publisherService.findById(publisherId, tenantId);

        // ✅ CRITICAL: Verify publisher belongs to tenant
        if (publisher && publisher.tenant_id !== tenantId) {
          throw new Error('Publisher does not belong to this tenant');
        }
      }

      // Resolve callback URL: assignment.callback_url OR publisher.global_postback_url
      const callbackUrl = assignment?.callback_url || publisher?.global_postback_url;

      // Send postback to publisher's callback URL if available
      console.log(callbackUrl);
      let postbackResult = null;
      if (callbackUrl && conversion) {
        postbackResult = await this.sendPublisherPostback(callbackUrl, conversion, click);
      } else {
        postbackResult = {
          success: false,
          executed: false,
          reason: !callbackUrl ? 'No callback URL configured' : 'No conversion created'
        };
      }

      return {
        success: true,
        message: 'Conversion recorded successfully',
        conversion,
        duplicate: false,
        affiliate_postback: postbackResult
      };
    } catch (error) {
      // Handle MySQL duplicate key violations
      if (error.code === 'ER_DUP_ENTRY') {
        // Check if it's the click_uuid unique constraint violation
        if (error.message && error.message.includes('uniq_click_uuid')) {
          return {
            success: false,
            message: 'This click has already generated a conversion. One click can only give one conversion.',
            duplicate: false,
            error_type: 'duplicate_click_conversion'
          };
        }
        // Check if it's the rcid + offer_id unique constraint violation
        if (error.message && error.message.includes('uniq_rcid_offer')) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated by rcid)',
            duplicate: true,
            error_type: 'duplicate_rcid_offer'
          };
        }
        // Generic duplicate entry error
        return {
          success: false,
          message: 'Duplicate entry detected',
          duplicate: true,
          error_type: 'duplicate_entry'
        };
      }

      // Handle other specific errors
      if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new Error('Invalid reference: The specified offer, publisher, or assignment does not exist');
      }

      if (error.code === 'ER_DATA_TOO_LONG') {
        throw new Error('Data too long for one or more fields. Please check your input length.');
      }

      logger.error('PostbackService.processPostback error:', error);
      throw error;
    }
  }

  async updateDailyStats(offerId, revenue, payout) {
    try {
      // UTC ENFORCEMENT: Store UTC date in DB. Business logic converts to IST only at query time.
      // Use CONVERT_TZ(created_at, '+00:00', '+05:30') in queries for IST display
      const today = new Date().toISOString().split('T')[0];

      const profit = revenue - payout;

      await pool.query(
        `INSERT INTO daily_offer_stats (offer_id, day, conversions, revenue, payout, profit, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           conversions = daily_offer_stats.conversions + 1,
           revenue = daily_offer_stats.revenue + VALUES(revenue),
           payout = daily_offer_stats.payout + VALUES(payout),
           profit = daily_offer_stats.profit + VALUES(profit),
           updated_at = UTC_TIMESTAMP()`,
        [offerId, today, revenue, payout, profit]
      );
    } catch (error) {
      logger.error('PostbackService.updateDailyStats error:', error);
    }
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    if (capAmount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    let query = `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`;
    const params = [offerId, publisherId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);

    const totalRevenue = parseFloat((Array.isArray(rows) ? rows[0] : rows).total_revenue || 0);
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    if (capCount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    let query = `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`;
    const params = [offerId, publisherId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);

    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
    return count >= capCount;
  }
  async sendPublisherPostback(callbackUrl, conversion, click) {
    const startTime = Date.now();
    let finalUrl = callbackUrl;
    let httpStatus = 0;
    let responseBody = '';
    let errorMessage = null;

    return new Promise((resolve) => {
      try {
        // Correct Macro Mapping:
        // {affiliate_click_id} -> click.tid (The ID affiliate provided)
        // {click_id} -> click.tid (Standard mapping for affiliates who expect their ID back in click_id param)
        const affiliateClickId = click?.tid || '';

        // Replace macros in callback URL using replaceMacros function
        const url = replaceMacros(callbackUrl, {
          click_id: affiliateClickId, // Map standard click_id macro to affiliate's ID
          affiliate_click_id: affiliateClickId, // Specific macro
          conversion_id: conversion.conversion_uuid || '',
          rcid: conversion.rcid || '',
          payout: conversion.payout?.toString() || '0',
          amount: conversion.amount?.toString() || '0',
          status: conversion.status || 'pending',
        });

        // Also replace additional macros that might be used manually
        finalUrl = url
          .replace(/{affiliate_click_id}/gi, affiliateClickId)
          .replace(/{conversion_id}/gi, conversion.conversion_uuid || '')
          .replace(/{CONVERSION_ID}/gi, conversion.conversion_uuid || '')
          .replace(/{payout}/gi, conversion.payout?.toString() || '0')
          .replace(/{PAYOUT}/gi, conversion.payout?.toString() || '0')
          .replace(/{amount}/gi, conversion.amount?.toString() || '0')
          .replace(/{AMOUNT}/gi, conversion.amount?.toString() || '0')
          .replace(/{status}/gi, conversion.status || 'pending')
          .replace(/{STATUS}/gi, conversion.status || 'pending');

        // Send GET request to publisher callback URL
        const urlObj = new URL(finalUrl);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.get(finalUrl, { timeout: 5000 }, async (res) => {
          httpStatus = res.statusCode;

          // Consume response
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', async () => {
            responseBody = data.substring(0, 1000); // Truncate if too long
            logger.info(`Postback sent to publisher: ${finalUrl} - Status: ${res.statusCode}`);
            logger.info('Publisher Postback Function Success', { url: finalUrl, status: httpStatus });

            // Log success
            await this.logPostbackAttempt({
              publisher_id: click?.publisher_id,
              conversion_id: conversion.id,
              affiliate_click_id: affiliateClickId,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody,
              execution_time_ms: Date.now() - startTime
            });

            resolve({
              success: httpStatus >= 200 && httpStatus < 300,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody
            });
          });
        });

        req.on('error', async (err) => {
          errorMessage = err.message;
          logger.error(`PostbackService.sendPublisherPostback error for ${finalUrl}:`, err.message);
          logger.error('Publisher Postback Function Failed', { url: finalUrl, error: errorMessage });

          // Log error
          await this.logPostbackAttempt({
            publisher_id: click?.publisher_id,
            conversion_id: conversion.id,
            affiliate_click_id: affiliateClickId,
            fired_url: finalUrl,
            http_status: 0,
            response_body: null,
            error_message: errorMessage,
            execution_time_ms: Date.now() - startTime
          });

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: errorMessage
          });
        });

        req.on('timeout', () => {
          req.destroy();
          errorMessage = 'Timeout';
          logger.warn(`PostbackService.sendPublisherPostback timeout for ${finalUrl}`);
          logger.error('Publisher Postback Function Failed (Timeout)', { url: finalUrl });

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: 'Timeout'
          });
        });

        req.setTimeout(5000);
      } catch (error) {
        errorMessage = error.message;
        logger.error('PostbackService.sendPublisherPostback error:', error);
        logger.error('Publisher Postback Function Failed (Exception)', { url: finalUrl, error: errorMessage });

        // Use an IIFE to handle async logging in catch block
        (async () => {
          await this.logPostbackAttempt({
            publisher_id: click?.publisher_id,
            conversion_id: conversion.id,
            affiliate_click_id: click?.source_id,
            fired_url: finalUrl,
            http_status: 0,
            response_body: null,
            error_message: errorMessage,
            execution_time_ms: Date.now() - startTime
          });
        })();

        resolve({
          success: false,
          fired_url: finalUrl,
          http_status: 0,
          error: errorMessage
        });
      }
    });
  }

  async logPostbackAttempt(data) {
    try {
      await pool.query(
        `INSERT INTO affiliate_postback_logs (
          publisher_id, conversion_id, affiliate_click_id, fired_url, 
          http_status, response_body, error_message, execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.publisher_id || 0,
          data.conversion_id || null,
          data.affiliate_click_id || null,
          data.fired_url || '',
          data.http_status || 0,
          data.response_body || null,
          data.error_message || null,
          data.execution_time_ms || 0
        ]
      );
    } catch (err) {
      logger.error('Failed to write to affiliate_postback_logs:', err);
    }
  }

  async getPostbackLogs(filters = {}, tenantId = null) {
    try {
      let query = `
        SELECT l.*, p.email as publisher_email, p.company_name, p.tenant_id
        FROM affiliate_postback_logs l
        LEFT JOIN publishers p ON l.publisher_id = p.id
      `;
      const params = [];
      const conditions = [];

      // Tenant isolation
      if (tenantId) {
        conditions.push('p.tenant_id = ?');
        params.push(tenantId);
      }

      if (filters.publisher_id) {
        conditions.push('l.publisher_id = ?');
        params.push(filters.publisher_id);
      }

      if (filters.conversion_id) {
        conditions.push('l.conversion_id = ?');
        params.push(filters.conversion_id);
      }

      if (filters.affiliate_click_id) {
        conditions.push('l.affiliate_click_id = ?');
        params.push(filters.affiliate_click_id);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY l.id DESC';

      // Count query for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM affiliate_postback_logs l
        LEFT JOIN publishers p ON l.publisher_id = p.id
      `;
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }

      const [countRows] = await pool.query(countQuery, params); // reusing params as conditions are same
      const total = countRows[0].total;

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      } else {
        query += ' LIMIT 100';
      }

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }

      const [rows] = await pool.query(query, params);

      return {
        data: rows,
        total: total
      };
    } catch (error) {
      logger.error('PostbackService.getPostbackLogs error:', error);
      throw error;
    }
  }

  /**
   * Validate offer is active and not expired before processing conversion
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferForConversion(offer) {
    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not active. Current status: ${offer.status}. Only live offers can accept conversions.`,
        error_type: 'offer_not_active'
      };
    }

    // UTC ENFORCEMENT: Business logic validation uses IST conversion for time-based checks
    // Storage remains UTC, only business rules convert to IST
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const currentDate = istTime.toISOString().split('T')[0]; // YYYY-MM-DD in IST
    const currentTime = istTime.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS in IST

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date); // Assuming stored as YYYY-MM-DD
      // We interpret stored date as end of that day in IST
      endDate.setHours(23, 59, 59, 999);

      // Compare YYYY-MM-DD strings to avoid offset confusion
      if (currentDate > offer.end_date) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      // Compare YYYY-MM-DD strings
      if (currentDate < offer.start_date) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions if both start_time and end_time are set
    // Assuming start_time and end_time are stored as 'HH:MM:SS' strings
    if (offer.start_time && offer.end_time) {
      const startTime = offer.start_time;
      const endTime = offer.end_time;

      // Compare times (HH:MM:SS format)
      if (currentTime < startTime || currentTime > endTime) {
        return {
          valid: false,
          message: `Conversion outside allowed time window. Allowed: ${startTime} - ${endTime}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.start_time) {
      // Only start_time set
      if (currentTime < offer.start_time) {
        return {
          valid: false,
          message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.end_time) {
      // Only end_time set
      if (currentTime > offer.end_time) {
        return {
          valid: false,
          message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    }

    return {
      valid: true,
      message: 'Offer is valid for conversion',
      error_type: null
    };
  }

  async isCapExceeded(offer, tenantId = null) {
    // ✅ CRITICAL: Total cap check with tenant_id filtering
    if (offer.total_cap && offer.total_cap > 0) {
      let query = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const totalCount = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (totalCount >= offer.total_cap) return true;
    }

    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    const tz = '+05:30';

    if (capType === 'daily' && offer.daily_cap && offer.daily_cap > 0) {
      let query = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.daily_cap) return true;
    }

    if (capType === 'monthly' && offer.monthly_cap && offer.monthly_cap > 0) {
      let query = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.monthly_cap) return true;
    }

    if (capType === 'weekly' && offer.total_cap && offer.total_cap > 0) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`,
        [offer.id]
      );
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.total_cap) return true;
    }

    return false;
  }
}

export default new PostbackService();

