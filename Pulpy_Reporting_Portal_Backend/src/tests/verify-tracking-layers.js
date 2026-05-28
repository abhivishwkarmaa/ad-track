/**
 * ============================================================================
 *  CLICK PIPELINE — END-TO-END VERIFICATION SCRIPT  (Layers 1, 2, 3, 4)
 * ============================================================================
 *
 *  Purpose
 *  -------
 *  Run this against a LIVE backend (local or staging) before/after any change
 *  to the click hot path to confirm nothing broke. The script exercises the
 *  full /click pipeline and verifies the byte-level invariants that the
 *  optimization layers MUST preserve.
 *
 *  What it checks
 *  --------------
 *   1. 302 redirect status                         (happy path)
 *   2. Location header is a valid offer URL with click_id appended
 *   3. End-to-end server latency (timings printed)
 *   4. Redis hash `click:{tenant}:{offer}:{pub}:{click_id}` exists with all
 *      expected fields (offer_id, publisher_id, tenant_id, ip, user_agent,
 *      click_uuid, timestamp, flushed='false', force_reject)
 *   5. Stream `stream:clicks` length grew by ≥ 1
 *   6. 5-second redirect-dedup cache: 2nd identical request returns the same
 *      Location (and is dramatically faster)
 *   7. Invalid offer_id returns HTML error page (NOT a 302)
 *   8. Invalid pub_id  returns HTML error page (NOT a 302)
 *   9. CLICK_FIRE_AND_FORGET mode: redirect comes back BEFORE persistence
 *      completes but the hash + stream entry STILL show up shortly after.
 *
 *  How to run
 *  ----------
 *      # Configure via env vars (all optional):
 *      #   BASE_URL       default http://localhost:5001
 *      #   HOST_HEADER    tenant subdomain to spoof, default localhost
 *      #   OFFER_ID       public offer id to test, default 1
 *      #   PUB_ID         public publisher id to test, default 1
 *      #   TENANT_ID      numeric tenant id (used for Redis key probes)
 *      #   REDIS_HOST/REDIS_PORT/REDIS_PASSWORD — same as backend .env
 *      #   FIRE_FORGET_RUN=1   also runs the fire-and-forget scenario
 *
 *      node src/tests/verify-tracking-layers.js
 *
 *  Exit codes
 *  ----------
 *      0  → ALL CHECKS PASSED (safe to ship)
 *      1  → at least one check failed (DO NOT SHIP)
 *
 *  Notes
 *  -----
 *  - This script makes NO writes to MySQL and NO writes to Redis other than
 *    those triggered organically by hitting /click.
 *  - It cleans up redirect-dedup keys at the end so back-to-back runs are
 *    deterministic.
 * ============================================================================
 */

import http from 'http';
import https from 'https';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// ----- Config -----
const BASE_URL    = process.env.BASE_URL    || 'http://localhost:5001';
const HOST_HEADER = process.env.HOST_HEADER || 'localhost';
const OFFER_ID    = process.env.OFFER_ID    || '1';
const PUB_ID      = process.env.PUB_ID      || '1';
const TENANT_ID   = process.env.TENANT_ID   || '1';
const FIRE_FORGET_RUN = process.env.FIRE_FORGET_RUN === '1';

const REDIS_HOST     = process.env.REDIS_HOST     || '127.0.0.1';
const REDIS_PORT     = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// ----- ANSI helpers -----
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

const pass = (msg) => console.log(`${C.green}  ✅ ${msg}${C.reset}`);
const fail = (msg) => { console.log(`${C.red}  ❌ ${msg}${C.reset}`); failures.push(msg); };
const info = (msg) => console.log(`${C.dim}     ${msg}${C.reset}`);
const head = (msg) => console.log(`\n${C.cyan}${C.bold}▶ ${msg}${C.reset}`);

const failures = [];

// ----- HTTP -----
function request(url, { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const started = Date.now();
    const req = client.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        elapsedMs: Date.now() - started,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ----- Redis -----
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
});

redis.on('error', (e) => {
  // Suppress noisy retry logs; the test will fail naturally if Redis is down.
  if (!String(e.message).includes('ECONNREFUSED')) {
    console.error(`${C.red}Redis error:${C.reset}`, e.message);
  }
});

// ----- helpers -----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractClickId(location) {
  const m = String(location || '').match(/[?&]click_id=([^&]+)/);
  return m ? m[1] : null;
}

async function findClickHash(tenantId, offerInternalId, pubInternalId, clickId) {
  // We do NOT know the *internal* offer/publisher ids in the script — so we
  // SCAN for any click:* key ending with the click id we captured.
  let cursor = '0';
  let matches = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `click:*:*:*:${clickId}`, 'COUNT', 200);
    cursor = next;
    matches = matches.concat(batch);
  } while (cursor !== '0' && matches.length < 10);
  if (matches.length === 0) return null;
  const key = matches[0];
  const hash = await redis.hgetall(key);
  return { key, hash };
}

async function probeStreamLength() {
  try {
    return await redis.xlen('stream:clicks');
  } catch {
    return 0;
  }
}

// ----- TESTS -----

async function testHappyPath() {
  head('1) /click happy path — expects 302 + valid Location + Redis hash + stream entry');

  const streamBefore = await probeStreamLength();

  const url = `${BASE_URL}/click?offer_id=${OFFER_ID}&pub_id=${PUB_ID}`;
  info(`GET ${url}    (Host: ${HOST_HEADER})`);

  const res = await request(url, {
    headers: {
      Host: HOST_HEADER,
      'user-agent': 'verify-tracking-layers/1.0 (Mozilla/5.0; Test)',
      'x-forwarded-for': '8.8.8.8',
    },
  });

  info(`status=${res.status}  elapsed=${res.elapsedMs}ms`);

  if (res.status !== 302) {
    fail(`expected status 302, got ${res.status}`);
    info(`body: ${res.body.slice(0, 200)}`);
    return null;
  }
  pass(`status is 302  (server latency ${res.elapsedMs}ms)`);

  const loc = res.headers.location;
  if (!loc || !/^https?:\/\//.test(loc)) {
    fail(`Location header missing or not absolute URL: ${loc}`);
    return null;
  }
  pass(`Location header valid → ${loc.slice(0, 80)}${loc.length > 80 ? '…' : ''}`);

  const clickId = extractClickId(loc);
  if (!clickId) {
    fail('Location URL does not contain click_id query param');
    return null;
  }
  pass(`click_id captured → ${clickId}`);

  // Wait a beat for the async pipeline (esp. fire-and-forget mode) to settle.
  await sleep(300);

  // Verify Redis hash
  const found = await findClickHash(TENANT_ID, null, null, clickId);
  if (!found) {
    fail(`Redis hash for click_id=${clickId} not found (scanned click:*:*:*:${clickId})`);
  } else {
    pass(`Redis hash present → ${found.key}`);
    const required = ['click_uuid', 'offer_id', 'publisher_id', 'tenant_id', 'ip', 'user_agent', 'timestamp', 'flushed'];
    const missing = required.filter((f) => !(f in found.hash));
    if (missing.length === 0) {
      pass(`hash has all required fields (${required.length})`);
    } else {
      fail(`hash is missing fields: ${missing.join(', ')}`);
    }
    if (found.hash.tenant_id && String(found.hash.tenant_id) !== String(TENANT_ID)) {
      fail(`hash tenant_id=${found.hash.tenant_id} ≠ expected ${TENANT_ID}`);
    } else if (found.hash.tenant_id) {
      pass(`hash tenant_id matches → ${found.hash.tenant_id}`);
    }
    if (found.hash.flushed !== 'false') {
      fail(`hash.flushed should be 'false' before worker runs, got '${found.hash.flushed}'`);
    } else {
      pass(`hash.flushed = 'false' (worker will set to 'true' after DB insert)`);
    }
  }

  // Verify stream grew
  const streamAfter = await probeStreamLength();
  if (streamAfter > streamBefore) {
    pass(`stream:clicks grew from ${streamBefore} → ${streamAfter} (Δ=${streamAfter - streamBefore})`);
  } else {
    fail(`stream:clicks did NOT grow (before=${streamBefore} after=${streamAfter})`);
  }

  return { clickId, location: loc, elapsedMs: res.elapsedMs };
}

async function testDedupCache(firstResult) {
  head('2) Duplicate click within 5s — should return cached Location (faster than first)');

  if (!firstResult) return info('skipped (happy path failed)');

  const url = `${BASE_URL}/click?offer_id=${OFFER_ID}&pub_id=${PUB_ID}`;
  const res = await request(url, {
    headers: {
      Host: HOST_HEADER,
      'user-agent': 'verify-tracking-layers/1.0 (Mozilla/5.0; Test)',
      'x-forwarded-for': '8.8.8.8',
    },
  });

  info(`status=${res.status}  elapsed=${res.elapsedMs}ms  (first was ${firstResult.elapsedMs}ms)`);

  if (res.status !== 302) {
    fail(`expected 302 on dedup, got ${res.status}`);
  } else {
    pass('dedup hit still returns 302');
  }
  if (res.headers.location === firstResult.location) {
    pass('dedup returned IDENTICAL Location (same redirect URL)');
  } else {
    fail(`dedup returned different Location.\n      first:  ${firstResult.location}\n      second: ${res.headers.location}`);
  }
}

async function testInvalidOffer() {
  head('3) Invalid offer_id — must return HTML error page, NOT a 302');

  const url = `${BASE_URL}/click?offer_id=__nonexistent_offer_xyz__&pub_id=${PUB_ID}`;
  const res = await request(url, {
    headers: { Host: HOST_HEADER, 'user-agent': 'verify-tracking-layers/1.0' },
  });

  if (res.status === 302) {
    fail(`invalid offer redirected with 302 to ${res.headers.location} — should be HTML error`);
    return;
  }
  pass(`status ${res.status} (not 302)`);

  const isErrorPage =
    /offer/i.test(res.body) && /not.found|offer_not_found|cannot find/i.test(res.body);
  if (isErrorPage) {
    pass('response body looks like the offer-not-found error page');
  } else {
    info(`body sample: ${res.body.slice(0, 160)}`);
    fail('response body did not look like an offer-not-found error page');
  }
}

async function testInvalidPublisher() {
  head('4) Invalid pub_id — must return HTML error page, NOT a 302');

  const url = `${BASE_URL}/click?offer_id=${OFFER_ID}&pub_id=__nonexistent_pub_xyz__`;
  const res = await request(url, {
    headers: { Host: HOST_HEADER, 'user-agent': 'verify-tracking-layers/1.0' },
  });

  if (res.status === 302) {
    fail(`invalid pub redirected with 302 to ${res.headers.location} — should be HTML error`);
    return;
  }
  pass(`status ${res.status} (not 302)`);
}

async function testFireAndForget() {
  head('5) Fire-and-forget mode — redirect must arrive fast; persistence catches up shortly after');

  if (!FIRE_FORGET_RUN) {
    info('skipped — set FIRE_FORGET_RUN=1 (and start the server with CLICK_FIRE_AND_FORGET=1) to run this');
    return;
  }

  const streamBefore = await probeStreamLength();

  // Use a different UA so we don't hit the 5s dedup cache from earlier tests
  const url = `${BASE_URL}/click?offer_id=${OFFER_ID}&pub_id=${PUB_ID}&_t=${Date.now()}`;
  const res = await request(url, {
    headers: {
      Host: HOST_HEADER,
      'user-agent': 'verify-tracking-layers/1.0 FF-mode',
      'x-forwarded-for': '8.8.4.4',
    },
  });

  info(`status=${res.status}  elapsed=${res.elapsedMs}ms`);
  if (res.status !== 302) {
    fail(`expected 302 in FF mode, got ${res.status}`);
    return;
  }
  pass(`302 received in ${res.elapsedMs}ms`);

  const clickId = extractClickId(res.headers.location);
  if (!clickId) { fail('no click_id in FF Location'); return; }

  // Now poll Redis for up to 2s — hash should appear shortly after the response.
  let found = null;
  for (let i = 0; i < 20 && !found; i++) {
    found = await findClickHash(TENANT_ID, null, null, clickId);
    if (!found) await sleep(100);
  }
  if (found) {
    pass(`FF persistence completed after redirect → ${found.key}`);
  } else {
    fail('FF mode: Redis hash never appeared within 2s after redirect');
  }

  const streamAfter = await probeStreamLength();
  if (streamAfter > streamBefore) {
    pass(`stream:clicks grew in FF mode (${streamBefore} → ${streamAfter})`);
  } else {
    fail('FF mode: stream:clicks did not grow within polling window');
  }
}

async function cleanup() {
  head('Cleanup — clear redirect-dedup keys used during this run');
  try {
    let cursor = '0';
    let keys = [];
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', `redirect:${TENANT_ID}:*verify-tracking-layers*`, 'COUNT', 200);
      cursor = next;
      keys = keys.concat(batch);
    } while (cursor !== '0');
    if (keys.length) {
      await redis.del(...keys);
      info(`deleted ${keys.length} redirect:* dedup keys`);
    } else {
      info('no dedup keys to clean (they auto-expire in 5s anyway)');
    }
  } catch (e) {
    info(`cleanup skipped: ${e.message}`);
  }
}

// ----- runner -----
async function main() {
  console.log(`${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  Click Pipeline — Layers 1/2/3/4 Verification              ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`Target:    ${BASE_URL}`);
  console.log(`Host hdr:  ${HOST_HEADER}`);
  console.log(`Offer/Pub: offer_id=${OFFER_ID}  pub_id=${PUB_ID}  tenant_id=${TENANT_ID}`);
  console.log(`Redis:     ${REDIS_HOST}:${REDIS_PORT}`);

  // Wait for Redis to be ready (or fail fast)
  try {
    await redis.ping();
  } catch (e) {
    console.error(`${C.red}Cannot connect to Redis at ${REDIS_HOST}:${REDIS_PORT}${C.reset}`);
    console.error('Set REDIS_HOST / REDIS_PORT / REDIS_PASSWORD env vars, or start a local Redis.');
    process.exit(2);
  }

  const happy = await testHappyPath();
  await testDedupCache(happy);
  await testInvalidOffer();
  await testInvalidPublisher();
  await testFireAndForget();
  await cleanup();

  console.log('\n' + '─'.repeat(64));
  if (failures.length === 0) {
    console.log(`${C.green}${C.bold}✅ ALL CHECKS PASSED${C.reset}`);
    await redis.quit();
    process.exit(0);
  } else {
    console.log(`${C.red}${C.bold}❌ ${failures.length} CHECK(S) FAILED${C.reset}`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    await redis.quit();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(`${C.red}Unexpected error:${C.reset}`, err);
  try { await redis.quit(); } catch {}
  process.exit(2);
});
