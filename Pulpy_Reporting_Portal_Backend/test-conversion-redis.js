#!/usr/bin/env node

/**
 * Test script to verify conversion hashes are being created in Redis
 * Usage: node test-conversion-redis.js
 */

import Redis from 'ioredis';
const redis = new Redis({ host: 'localhost', port: 6379 });

async function testConversionRedis() {
  console.log('🔍 Testing Conversion Redis Storage...\n');

  try {
    // 1. Check existing conversion keys
    const existingKeys = await redis.keys('conversion:*');
    console.log(`📊 Found ${existingKeys.length} existing conversion keys:`);
    existingKeys.slice(0, 5).forEach(key => {
      console.log(`   - ${key}`);
    });
    if (existingKeys.length > 5) {
      console.log(`   ... and ${existingKeys.length - 5} more`);
    }

    // 2. Check stream lengths
    const conversionStreamLen = await redis.xlen('stream:conversion_processing');
    const postbackStreamLen = await redis.xlen('stream:postback_processing');
    console.log(`\n📨 Stream lengths:`);
    console.log(`   - stream:conversion_processing: ${conversionStreamLen} messages`);
    console.log(`   - stream:postback_processing: ${postbackStreamLen} messages`);

    // 3. Check recent stream entries
    if (conversionStreamLen > 0) {
      console.log(`\n📋 Recent conversion stream entries:`);
      const entries = await redis.xrevrange('stream:conversion_processing', '+', '-', 'COUNT', 3);
      entries.forEach(([id, fields]) => {
        const data = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        console.log(`   - ${id}: ${data.type || 'unknown'}`);
        if (data.conversion_data) {
          try {
            const convData = JSON.parse(data.conversion_data);
            console.log(`     Click UUID: ${convData.click_uuid}`);
            console.log(`     Tenant ID: ${convData.tenant_id}`);
          } catch (e) {
            // Ignore parse errors
          }
        }
      });
    }

    // 4. Check click keys (for comparison)
    const clickKeys = await redis.keys('click:*');
    console.log(`\n🖱️  Found ${clickKeys.length} click keys (for comparison)`);

    // 5. Test creating a sample conversion hash
    console.log(`\n🧪 Testing conversion hash creation...`);
    const testKey = `conversion:999:test_${Date.now()}`;
    const testHash = {
      conversion_uuid: `test_${Date.now()}`,
      click_uuid: 'test_click_id',
      offer_id: '1',
      publisher_id: '1',
      tenant_id: '999',
      amount: '100',
      status: 'approved',
      processed: 'false',
      timestamp: new Date().toISOString()
    };

    await redis.hset(testKey, testHash);
    await redis.expire(testKey, 3600);
    console.log(`   ✅ Created test conversion: ${testKey}`);

    // Verify it exists
    const retrieved = await redis.hgetall(testKey);
    console.log(`   ✅ Retrieved: ${Object.keys(retrieved).length} fields`);

    // Clean up test key
    await redis.del(testKey);
    console.log(`   ✅ Cleaned up test key`);

    // 6. Summary
    console.log(`\n📊 Summary:`);
    console.log(`   - Conversion keys: ${existingKeys.length}`);
    console.log(`   - Click keys: ${clickKeys.length}`);
    console.log(`   - Conversion stream: ${conversionStreamLen} messages`);
    console.log(`   - Postback stream: ${postbackStreamLen} messages`);

    if (existingKeys.length === 0 && conversionStreamLen === 0) {
      console.log(`\n⚠️  No conversions found! Possible reasons:`);
      console.log(`   1. PM2 hasn't been restarted with new code`);
      console.log(`   2. No postbacks have been processed yet`);
      console.log(`   3. Postbacks are failing before hash creation`);
      console.log(`   4. TTL expired (conversions expire after 1 hour)`);
    } else {
      console.log(`\n✅ Conversions are being stored in Redis!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await redis.quit();
    process.exit(0);
  }
}

testConversionRedis();