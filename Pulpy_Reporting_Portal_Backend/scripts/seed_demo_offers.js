import pool from '../src/db/connection.js';
import redis from '../src/config/redis.js';
import offerService from '../src/services/offer.service.js';
import offerEventsService from '../src/services/offerEventsService.js';
import assignmentService from '../src/services/assignmentService.js';
import offerPublicIdService from '../src/services/offerPublicIdService.js';
import cacheService from '../src/services/cacheService.js';

async function seedDemoOffers() {
  console.log('🚀 Seeding demo offers for demo@tickhigh.com...');

  try {
    // 1. Locate user & tenant
    const [userRows] = await pool.query(
      "SELECT id, email, role, tenant_id FROM admin_users WHERE email = 'demo@tickhigh.com' LIMIT 1"
    );

    let tenantId;
    if (userRows.length > 0 && userRows[0].tenant_id) {
      tenantId = userRows[0].tenant_id;
      console.log(`✅ Found user demo@tickhigh.com (ID: ${userRows[0].id}, Tenant ID: ${tenantId})`);
    } else {
      const [tenantRows] = await pool.query("SELECT id, name, slug FROM tenants WHERE slug = 'demo' LIMIT 1");
      if (tenantRows.length > 0) {
        tenantId = tenantRows[0].id;
        console.log(`✅ Found demo tenant by slug (ID: ${tenantId})`);
      } else {
        throw new Error('Tenant for demo@tickhigh.com not found!');
      }
    }

    // 2. Ensure advertisers exist for each vertical
    const advertisersData = [
      {
        name: 'Apex Gaming Studio',
        email: 'adv_gaming@demo.com',
        company_name: 'Apex Gaming Ltd',
        country: 'US',
        website: 'https://apexgaming.io',
      },
      {
        name: 'Zenith Digital Bank',
        email: 'adv_fintech@demo.com',
        company_name: 'Zenith NeoBank Inc',
        country: 'US',
        website: 'https://zenithbank.io',
      },
      {
        name: 'QuickDrop Retail Ltd',
        email: 'adv_ecommerce@demo.com',
        company_name: 'QuickDrop Delivery Corp',
        country: 'US',
        website: 'https://quickdrop.app',
      },
      {
        name: 'StreamMax Entertainment',
        email: 'adv_streaming@demo.com',
        company_name: 'StreamMax Media Networks',
        country: 'US',
        website: 'https://streammax.tv',
      },
      {
        name: 'FastCash Lending Services',
        email: 'adv_loans@demo.com',
        company_name: 'FastCash Financial Corp',
        country: 'US',
        website: 'https://fastcashloan.com',
      },
    ];

    const advertiserMap = {};

    for (const adv of advertisersData) {
      const [existing] = await pool.query(
        'SELECT id, public_advertiser_id FROM advertisers WHERE tenant_id = ? AND email = ? LIMIT 1',
        [tenantId, adv.email]
      );

      if (existing.length > 0) {
        advertiserMap[adv.name] = existing[0].id;
        if (!existing[0].public_advertiser_id) {
          const nextPubAdvId = await offerPublicIdService.generatePublicAdvertiserId(tenantId);
          await pool.query('UPDATE advertisers SET public_advertiser_id = ? WHERE id = ?', [nextPubAdvId, existing[0].id]);
        }
      } else {
        const publicAdvertiserId = await offerPublicIdService.generatePublicAdvertiserId(tenantId);
        const [insertRes] = await pool.query(
          `INSERT INTO advertisers (name, email, company_name, country, website, status, tenant_id, public_advertiser_id)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
          [adv.name, adv.email, adv.company_name, adv.country, adv.website, tenantId, publicAdvertiserId]
        );
        advertiserMap[adv.name] = insertRes.insertId;
        console.log(`✅ Created advertiser: ${adv.name} (ID: ${insertRes.insertId}, Public ID: ${publicAdvertiserId})`);
      }
    }

    // Ensure all advertisers in tenant have a public_advertiser_id
    const [nullPubAdv] = await pool.query('SELECT id FROM advertisers WHERE tenant_id = ? AND public_advertiser_id IS NULL', [tenantId]);
    for (const row of nullPubAdv) {
      const nextId = await offerPublicIdService.generatePublicAdvertiserId(tenantId);
      await pool.query('UPDATE advertisers SET public_advertiser_id = ? WHERE id = ?', [nextId, row.id]);
    }

    // 3. Ensure test publisher exists
    let publisherId;
    const [pubRows] = await pool.query(
      'SELECT id, public_publisher_id FROM publishers WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );

    if (pubRows.length > 0) {
      publisherId = pubRows[0].id;
      if (!pubRows[0].public_publisher_id) {
        const nextPubPubId = await offerPublicIdService.generatePublicPublisherId(tenantId);
        await pool.query('UPDATE publishers SET public_publisher_id = ? WHERE id = ?', [nextPubPubId, publisherId]);
      }
      console.log(`✅ Using Publisher (ID: ${publisherId})`);
    } else {
      const publicPublisherId = await offerPublicIdService.generatePublicPublisherId(tenantId);
      const [pubRes] = await pool.query(
        `INSERT INTO publishers (company_name, email, country, status, tenant_id, public_publisher_id, created_at, updated_at)
         VALUES ('Demo Affiliate Network', 'affiliate@demo.com', 'US', 'active', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [tenantId, publicPublisherId]
      );
      publisherId = pubRes.insertId;
      console.log(`✅ Created Publisher (ID: ${publisherId})`);
    }

    // 4. Define Offers to create
    const offersToCreate = [
      // -------------------------------------------------------------
      // EVENT-BASED OFFER 1: Gaming / Casino App (4 Events)
      // -------------------------------------------------------------
      {
        tenant_id: tenantId,
        advertiser_id: advertiserMap['Apex Gaming Studio'],
        name: 'MegaWin Casino & Slots (CPI + Reg + FTD)',
        description: 'Top converting Real-Money Casino & Slots game. Multi-event tracking rewards app installs, account registrations, first-time deposits (FTD), and recurring deposits.',
        category: 'Gaming',
        status: 'live',
        offer_visibility: 'public',
        offer_currency: 'USD',
        country: 'US',
        advertiser_model: 'CPA',
        advertiser_amount: 15.00, // fallback revenue
        affiliate_model: 'CPA',
        affiliate_amount: 8.00,   // fallback payout
        offer_url: 'https://play.megawincasino.com/track?click_id={click_id}&sub1={sub1}&sub2={sub2}',
        preview_url: 'https://play.megawincasino.com/preview',
        offer_params: [
          { param_key: 'sub1', is_required: false, default_value: '' },
          { param_key: 'sub2', is_required: false, default_value: '' },
        ],
        offer_events: [
          {
            event_name: 'install',
            title: 'App Install',
            advertiser_amount: 4.00,
            affiliate_amount: 2.50,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'registration',
            title: 'User Registration',
            advertiser_amount: 10.00,
            affiliate_amount: 6.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'first_deposit',
            title: 'First Deposit (FTD)',
            advertiser_amount: 60.00,
            affiliate_amount: 40.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'deposit',
            title: 'Repeat Deposit',
            advertiser_amount: 15.00,
            affiliate_amount: 10.00,
            allow_multiple: true,
            status: 'active',
          },
        ],
      },

      // -------------------------------------------------------------
      // EVENT-BASED OFFER 2: FinTech / Digital Banking App (3 Events)
      // -------------------------------------------------------------
      {
        tenant_id: tenantId,
        advertiser_id: advertiserMap['Zenith Digital Bank'],
        name: 'Zenith Digital Bank - KYC & 1st Spend (Multi-Goal)',
        description: 'Next-generation zero-fee digital checking account and debit card. Multi-stage milestones payout upon app download, KYC document verification, and first card swipe.',
        category: 'Finance',
        status: 'live',
        offer_visibility: 'public',
        offer_currency: 'USD',
        country: 'US',
        advertiser_model: 'CPA',
        advertiser_amount: 25.00, // fallback revenue
        affiliate_model: 'CPA',
        affiliate_amount: 16.00,  // fallback payout
        offer_url: 'https://app.zenithbank.io/signup?cid={click_id}&aff_sub1={sub1}',
        preview_url: 'https://zenithbank.io',
        offer_params: [
          { param_key: 'sub1', is_required: false, default_value: '' },
        ],
        offer_events: [
          {
            event_name: 'install',
            title: 'App Install & Open',
            advertiser_amount: 3.50,
            affiliate_amount: 2.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'kyc_verified',
            title: 'KYC Identity Verified',
            advertiser_amount: 15.00,
            affiliate_amount: 10.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'first_transaction',
            title: 'First Card Spend ($10+)',
            advertiser_amount: 35.00,
            affiliate_amount: 25.00,
            allow_multiple: false,
            status: 'active',
          },
        ],
      },

      // -------------------------------------------------------------
      // EVENT-BASED OFFER 3: E-Commerce / Quick Grocery (3 Events)
      // -------------------------------------------------------------
      {
        tenant_id: tenantId,
        advertiser_id: advertiserMap['QuickDrop Retail Ltd'],
        name: 'QuickDrop Grocery - 15-Min Delivery (Multi-Goal)',
        description: 'Hyperlocal 15-minute grocery and essentials delivery. Earn on app install, 1st grocery purchase, and repeat repeat purchases.',
        category: 'E-Commerce',
        status: 'live',
        offer_visibility: 'public',
        offer_currency: 'USD',
        country: 'US',
        advertiser_model: 'CPA',
        advertiser_amount: 12.00, // fallback revenue
        affiliate_model: 'CPA',
        affiliate_amount: 7.50,   // fallback payout
        offer_url: 'https://quickdrop.app/order?click_id={click_id}&sub1={sub1}',
        preview_url: 'https://quickdrop.app',
        offer_params: [
          { param_key: 'sub1', is_required: false, default_value: '' },
        ],
        offer_events: [
          {
            event_name: 'install',
            title: 'App Download & Open',
            advertiser_amount: 2.00,
            affiliate_amount: 1.20,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'first_order',
            title: '1st Grocery Order Completed',
            advertiser_amount: 12.00,
            affiliate_amount: 8.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'repeat_order',
            title: 'Repeat Grocery Purchase',
            advertiser_amount: 5.00,
            affiliate_amount: 3.00,
            allow_multiple: true,
            status: 'active',
          },
        ],
      },

      // -------------------------------------------------------------
      // EVENT-BASED OFFER 4: Streaming / OTT Subscription (3 Events)
      // -------------------------------------------------------------
      {
        tenant_id: tenantId,
        advertiser_id: advertiserMap['StreamMax Entertainment'],
        name: 'StreamMax Premium OTT & Live Sports (Multi-Goal)',
        description: 'Global 4K movie & live sports streaming platform. Triggers payouts on initial app download, 7-day free trial registration, and monthly VIP plan conversion.',
        category: 'Entertainment',
        status: 'live',
        offer_visibility: 'public',
        offer_currency: 'USD',
        country: 'US',
        advertiser_model: 'CPA',
        advertiser_amount: 18.00, // fallback revenue
        affiliate_model: 'CPA',
        affiliate_amount: 11.00,  // fallback payout
        offer_url: 'https://watch.streammax.tv/join?clickid={click_id}&sub1={sub1}',
        preview_url: 'https://watch.streammax.tv',
        offer_params: [
          { param_key: 'sub1', is_required: false, default_value: '' },
        ],
        offer_events: [
          {
            event_name: 'install',
            title: 'App Install',
            advertiser_amount: 1.50,
            affiliate_amount: 1.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'free_trial',
            title: '7-Day Free Trial Started',
            advertiser_amount: 6.00,
            affiliate_amount: 4.00,
            allow_multiple: false,
            status: 'active',
          },
          {
            event_name: 'paid_subscription',
            title: 'Monthly Paid Subscription',
            advertiser_amount: 22.00,
            affiliate_amount: 15.00,
            allow_multiple: false,
            status: 'active',
          },
        ],
      },

      // -------------------------------------------------------------
      // CLASSIC CONVERSION OFFER (Single Conversion CPA - "jo pehle tha")
      // -------------------------------------------------------------
      {
        tenant_id: tenantId,
        advertiser_id: advertiserMap['FastCash Lending Services'],
        name: 'FastCash Instant Personal Loans - CPA Lead (Classic Conversion)',
        description: 'Classic single-action CPA lead generation. Standard conversion fires when user submits an approved loan application. No multi-events (classic mode).',
        category: 'Finance',
        status: 'live',
        offer_visibility: 'public',
        offer_currency: 'USD',
        country: 'US',
        advertiser_model: 'CPA',
        advertiser_amount: 35.00, // Standard single-action revenue
        affiliate_model: 'CPA',
        affiliate_amount: 22.00,  // Standard single-action payout
        offer_url: 'https://fastcashloan.com/apply?click_id={click_id}&sub1={sub1}',
        preview_url: 'https://fastcashloan.com',
        offer_params: [
          { param_key: 'sub1', is_required: false, default_value: '' },
        ],
        offer_events: [], // NO multi-events: classic single conversion
      },
    ];

    console.log('\n📝 Inserting offers into database...');
    const createdOfferResults = [];

    for (const offerData of offersToCreate) {
      const created = await offerService.createOffer(offerData);
      console.log(`✅ Created Offer ID: ${created.id} (Public ID: ${created.public_offer_id}) -> "${created.name}"`);

      // Assign to publisher
      try {
        await assignmentService.create({
          offer_id: created.id,
          publishers: [
            {
              publisher_id: publisherId,
              status: 'active',
            }
          ]
        }, tenantId);
        console.log(`   🔗 Assigned to Publisher ${publisherId} (Status: active)`);
      } catch (assignErr) {
        console.log(`   ⚠️ Publisher assignment note: ${assignErr.message}`);
      }

      // Verify events
      const events = await offerEventsService.getOfferEvents(created.id, tenantId);
      createdOfferResults.push({
        id: created.id,
        public_id: created.public_offer_id,
        name: created.name,
        type: events.length > 0 ? `Multi-Event (${events.length} events)` : 'Classic Conversion (Single Action)',
        category: created.category,
        events: events.map(e => `${e.event_name} [Adv: $${e.advertiser_amount}, Aff: $${e.affiliate_amount}]`),
        advertiser_amount: created.advertiser_amount,
        affiliate_amount: created.affiliate_amount,
      });
    }

    console.log('\n🎉 ALL OFFERS SEEDED SUCCESSFULLY FOR demo@tickhigh.com!');
    console.table(createdOfferResults);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed offers:', err);
    process.exit(1);
  }
}

seedDemoOffers();
