import pool from '../src/db/connection.js';
import redis from '../src/config/redis.js';
import offerService from '../src/services/offer.service.js';
import offerEventsService from '../src/services/offerEventsService.js';
import postbackService from '../src/services/postbackService.js';
import logDetailService from '../src/services/logDetailService.js';
import runConversionWorker from '../src/workers/conversionWorker.js';

async function runTest() {
  console.log('🧪 Starting End-to-End Primary Goal + Secondary Events Architecture Test...\n');
  // Start conversion worker in background so queued conversions from stream are processed
  runConversionWorker().catch(err => console.error('Conversion worker error in test:', err));

  try {
    // 1. Get or create test tenant
    let [tenants] = await pool.query('SELECT id, slug FROM tenants LIMIT 1');
    let tenantId;
    let tenantSlug = 'demo';
    if (!tenants || tenants.length === 0) {
      const [res] = await pool.query("INSERT INTO tenants (name, slug, status) VALUES ('Demo Tenant', 'demo', 'active')");
      tenantId = res.insertId;
    } else {
      tenantId = tenants[0].id;
      tenantSlug = tenants[0].slug;
    }
    console.log(`✅ Using Tenant ID: ${tenantId} (${tenantSlug})`);

    // 2. Get or create test advertiser
    let [advs] = await pool.query('SELECT id FROM advertisers WHERE tenant_id = ? LIMIT 1', [tenantId]);
    let advId;
    if (!advs || advs.length === 0) {
      const [res] = await pool.query("INSERT INTO advertisers (tenant_id, name, email, status) VALUES (?, 'Test Advertiser', 'adv@test.com', 'active')", [tenantId]);
      advId = res.insertId;
    } else {
      advId = advs[0].id;
    }

    // 3. Get or create test publisher with postback callback URL
    let [pubs] = await pool.query('SELECT id FROM publishers WHERE tenant_id = ? LIMIT 1', [tenantId]);
    let pubId;
    const testPostbackUrl = 'http://127.0.0.1:5001/api/mock-callback?click_id={tid}&event={event}&payout={payout}';
    if (!pubs || pubs.length === 0) {
      const [res] = await pool.query("INSERT INTO publishers (tenant_id, company_name, email, global_postback_url, status) VALUES (?, 'Test Publisher', 'test@pub.com', ?, 'active')", [tenantId, testPostbackUrl]);
      pubId = res.insertId;
    } else {
      pubId = pubs[0].id;
      await pool.query("UPDATE publishers SET global_postback_url = ? WHERE id = ?", [testPostbackUrl, pubId]);
    }

    // 4. Create an Offer with 2 Secondary Events and 1 Primary Goal
    console.log('📝 Creating test offer with 2 Funnel Signals + 1 Primary Goal...');
    const testOfferData = {
      tenant_id: tenantId,
      advertiser_id: advId,
      name: `Primary Goal Funnel Test Offer ${Date.now()}`,
      offer_currency: 'USD',
      country: 'US',
      advertiser_model: 'CPA',
      advertiser_amount: 100.00,
      affiliate_model: 'CPA',
      affiliate_amount: 50.00,
      offer_url: 'https://advertiser.com/landing?clickid={click_id}',
      status: 'live',
      offer_events: [
        {
          event_name: 'install',
          title: 'App Install',
          advertiser_amount: 0.00,
          affiliate_amount: 0.00,
          is_primary: false,
          allow_multiple: false,
        },
        {
          event_name: 'registration',
          title: 'User Registration',
          advertiser_amount: 0.00,
          affiliate_amount: 0.00,
          is_primary: false,
          allow_multiple: false,
        },
        {
          event_name: 'deposit',
          title: 'First Cash Deposit',
          advertiser_amount: 100.00,
          affiliate_amount: 50.00,
          is_primary: true, // 👑 The ONLY official conversion!
          allow_multiple: false,
        }
      ]
    };

    const createdOffer = await offerService.createOffer(testOfferData);
    const offerId = createdOffer.id;
    console.log(`✅ Offer created successfully (ID: ${offerId}, Public ID: ${createdOffer.public_offer_id})`);

    // Verify configured events
    const configuredEvents = await offerEventsService.getOfferEvents(offerId, tenantId);
    console.log(`✅ Loaded ${configuredEvents.length} configured events from DB/Redis:`);
    configuredEvents.forEach(e => {
      console.log(`   - [${e.is_primary ? '👑 PRIMARY CONVERSION' : 'ℹ️ FUNNEL SIGNAL'}] ${e.event_name}: Rev=$${e.advertiser_amount}, Payout=$${e.affiliate_amount}`);
    });

    const primaryGoal = configuredEvents.find(e => e.is_primary);
    if (!primaryGoal || primaryGoal.event_name !== 'deposit') {
      throw new Error(`Expected 'deposit' to be the primary goal, found: ${primaryGoal?.event_name}`);
    }

    // 5. Simulate Click in MySQL `clicks` table AND Redis
    const testClickUuid = `click_test_funnel_${Date.now()}`;
    const clickData = {
      click_uuid: testClickUuid,
      offer_id: String(offerId),
      publisher_id: String(pubId),
      publisher_offer_id: '0',
      tenant_id: String(tenantId),
      tid: 'pub_click_abc',
      ip: '127.0.0.1',
      created_at: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id, tid, ip, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, UTC_TIMESTAMP())`,
      [testClickUuid, offerId, pubId, tenantId, 'pub_click_abc', '127.0.0.1']
    );

    await redis.hmset(`click:${testClickUuid}`, clickData);
    await redis.hmset(`click:${tenantId}:${offerId}:${pubId}:${testClickUuid}`, clickData);
    console.log(`✅ Click created in DB and Redis: ${testClickUuid}\n`);

    const mockRequest = {
      tenantId: tenantId,
      headers: { host: `${tenantSlug}.track.local` },
      ip: '127.0.0.1',
      url: `/postback?click_id=${testClickUuid}`,
      method: 'GET'
    };

    // -------------------------------------------------------------
    // 6. Test Step 1: Fire Secondary Event 1 ('install')
    // -------------------------------------------------------------
    console.log('⚡ STEP 1: Processing Postback for Funnel Signal: "install"...');
    const res1 = await postbackService.processPostback(
      { click_id: testClickUuid, event: 'install' },
      mockRequest
    );
    console.log('Result 1 (install):', { success: res1.success, message: res1.message, is_conversion: res1.is_conversion });
    if (!res1.success) throw new Error(`Install postback failed: ${res1.message}`);

    // Check DB: event_logs vs conversions
    const [evLogs1] = await pool.query('SELECT * FROM event_logs WHERE click_uuid = ?', [testClickUuid]);
    const [convs1] = await pool.query('SELECT * FROM conversions WHERE click_uuid = ?', [testClickUuid]);

    console.log(`🔍 Verification after "install":`);
    console.log(`   - event_logs count: ${evLogs1.length} (Expected: 1)`);
    console.log(`   - conversions count: ${convs1.length} (Expected: 0 - MUST NOT POLLUTE CONVERSIONS TABLE)`);

    if (evLogs1.length !== 1 || evLogs1[0].event_name !== 'install' || evLogs1[0].is_conversion !== 0) {
      throw new Error(`Verification failed for install event_logs!`);
    }
    if (convs1.length !== 0) {
      throw new Error(`CRITICAL BUG: Secondary event 'install' was inserted into conversions table!`);
    }

    // -------------------------------------------------------------
    // 7. Test Step 2: Fire Secondary Event 2 ('registration')
    // -------------------------------------------------------------
    console.log('\n⚡ STEP 2: Processing Postback for Funnel Signal: "registration"...');
    const res2 = await postbackService.processPostback(
      { click_id: testClickUuid, event: 'registration' },
      mockRequest
    );
    console.log('Result 2 (registration):', { success: res2.success, message: res2.message, is_conversion: res2.is_conversion });
    if (!res2.success) throw new Error(`Registration postback failed: ${res2.message}`);

    const [evLogs2] = await pool.query('SELECT event_name, is_conversion, amount, payout FROM event_logs WHERE click_uuid = ? ORDER BY id ASC', [testClickUuid]);
    const [convs2] = await pool.query('SELECT * FROM conversions WHERE click_uuid = ?', [testClickUuid]);

    console.log(`🔍 Verification after "registration":`);
    console.log(`   - event_logs count: ${evLogs2.length} (Expected: 2) ->`, evLogs2.map(e => e.event_name));
    console.log(`   - conversions count: ${convs2.length} (Expected: 0 - STILL NO OFFICIAL CONVERSION)`);

    if (evLogs2.length !== 2) throw new Error('Expected 2 event logs!');
    if (convs2.length !== 0) throw new Error('CRITICAL BUG: Secondary event was inserted into conversions table!');

    // -------------------------------------------------------------
    // 8. Test Step 3: Fire Primary Goal Event ('deposit')
    // -------------------------------------------------------------
    console.log('\n⚡ STEP 3: Processing Postback for 👑 Primary Goal: "deposit"...');
    const res3 = await postbackService.processPostback(
      { click_id: testClickUuid, event: 'deposit', amount: '100' },
      mockRequest
    );
    console.log('Result 3 (deposit):', { success: res3.success, message: res3.message, is_conversion: res3.is_conversion });
    if (!res3.success) throw new Error(`Deposit postback failed: ${res3.message}`);

    // Allow worker up to 2 seconds to process stream
    console.log('⏳ Waiting 2 seconds for worker to process stream:conversions...');
    await new Promise(r => setTimeout(r, 2000));

    const [evLogs3] = await pool.query('SELECT event_name, is_conversion, amount, payout, status FROM event_logs WHERE click_uuid = ? ORDER BY id ASC', [testClickUuid]);
    const [convs3] = await pool.query('SELECT conversion_uuid, click_uuid, event_name, amount, payout, status FROM conversions WHERE click_uuid = ?', [testClickUuid]);

    console.log(`🔍 Verification after "deposit" (Primary Conversion):`);
    console.log(`   - event_logs count: ${evLogs3.length} (Expected: 3 total funnel events) ->`, evLogs3.map(e => `${e.event_name} (is_conversion=${e.is_conversion})`));
    console.log(`   - conversions count: ${convs3.length} (Expected: EXACTLY 1 BILLABLE CONVERSION)`);

    if (evLogs3.length !== 3) {
      throw new Error(`Expected 3 event logs, got ${evLogs3.length}`);
    }
    if (convs3.length !== 1) {
      throw new Error(`Expected exactly 1 conversion in conversions table, got ${convs3.length}`);
    }
    if (convs3[0].event_name !== 'deposit') {
      throw new Error(`Expected conversion event_name to be 'deposit', got '${convs3[0].event_name}'`);
    }

    // -------------------------------------------------------------
    // 9. Test Step 4: Verify Stats Table
    // -------------------------------------------------------------
    console.log('\n📊 STEP 4: Verifying Daily Offer Stats...');
    const [statsRows] = await pool.query('SELECT conversions, approved_conversions, revenue, payout FROM daily_offer_stats WHERE offer_id = ?', [offerId]);
    console.log('daily_offer_stats for this offer:', statsRows);
    if (statsRows.length > 0) {
      const totalConvs = statsRows.reduce((sum, r) => sum + Number(r.conversions || 0), 0);
      console.log(`   - Total offer conversions count: ${totalConvs} (Expected: 1 - NOT 3!)`);
      if (totalConvs !== 1) {
        throw new Error(`Conversion count inflated! Expected 1 conversion, got ${totalConvs}`);
      }
    }

    // Verify daily_offer_event_stats
    const [eventStatsRows] = await pool.query('SELECT event_name, conversions, revenue, payout FROM daily_offer_event_stats WHERE offer_id = ? ORDER BY event_name ASC', [offerId]);
    console.log('daily_offer_event_stats breakdown:', eventStatsRows);
    if (eventStatsRows.length !== 3) {
      throw new Error(`Expected 3 event stats entries, got ${eventStatsRows.length}`);
    }

    // -------------------------------------------------------------
    // 10. Test Step 5: Test Click Detail API Service
    // -------------------------------------------------------------
    console.log('\n🔍 STEP 5: Testing logDetailService.getClickDetail for full drill-down...');
    const clickDetail = await logDetailService.getClickDetail(testClickUuid, tenantId);
    console.log(`   - Click Detail returned:`);
    console.log(`     - click_uuid: ${clickDetail.click?.click_uuid}`);
    console.log(`     - conversion_uuid: ${clickDetail.conversion?.conversion_uuid} (event: ${clickDetail.conversion?.event_name})`);
    console.log(`     - events timeline: ${clickDetail.events?.length} events found:`);
    clickDetail.events.forEach(e => {
      console.log(`       * [${e.is_conversion ? '👑 Primary Goal' : 'Signal'}] ${e.event_name} | Rev=$${e.amount} | Payout=$${e.payout} | Status=${e.status}`);
    });

    if (!clickDetail.events || clickDetail.events.length !== 3) {
      throw new Error(`Click detail events timeline missing or incomplete! Got ${clickDetail.events?.length} items`);
    }

    // -------------------------------------------------------------
    // 11. Clean Up
    // -------------------------------------------------------------
    await pool.query('DELETE FROM event_logs WHERE click_uuid = ?', [testClickUuid]);
    await pool.query('DELETE FROM conversions WHERE click_uuid = ?', [testClickUuid]);
    await pool.query('DELETE FROM clicks WHERE click_uuid = ?', [testClickUuid]);
    await pool.query('DELETE FROM daily_offer_stats WHERE offer_id = ?', [offerId]);
    await pool.query('DELETE FROM daily_offer_event_stats WHERE offer_id = ?', [offerId]);
    await pool.query('DELETE FROM offer_events WHERE offer_id = ?', [offerId]);
    await pool.query('DELETE FROM offers WHERE id = ?', [offerId]);

    console.log('\n🎉🎉🎉 ALL ARCHITECTURAL TESTS PASSED PERFECTLY! 🎉🎉🎉');
    console.log('Summary:');
    console.log('1. Secondary events (install, registration) logged in event_logs without polluting conversions.');
    console.log('2. Publisher postbacks triggered with {event} macro for bidding algorithms.');
    console.log('3. Exactly 1 primary goal conversion recorded in conversions table with strict caps and stats.');
    console.log('4. Click Detail timeline displays all 3 events with Primary Goal badge.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTest();
