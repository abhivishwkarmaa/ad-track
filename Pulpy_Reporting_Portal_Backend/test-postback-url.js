#!/usr/bin/env node

/**
 * Test script to verify postback URL connectivity
 * Usage: node test-postback-url.js <url>
 * Example: node test-postback-url.js "https://ravi.track-myads.com/postback?click_id=test123&amount=100"
 */

import https from 'https';
import http from 'http';

const testUrl = process.argv[2];

if (!testUrl) {
  console.error('❌ Usage: node test-postback-url.js <url>');
  console.error('Example: node test-postback-url.js "https://ravi.track-myads.com/postback?click_id=test123&amount=100"');
  process.exit(1);
}

console.log('🧪 Testing postback URL connectivity...\n');
console.log('📍 URL:', testUrl);
console.log('⏱️  Timeout: 10 seconds\n');

const startTime = Date.now();
const urlObj = new URL(testUrl);
const client = urlObj.protocol === 'https:' ? https : http;
const POSTBACK_TIMEOUT = 10000;

const req = client.get(testUrl, {
  timeout: POSTBACK_TIMEOUT,
  headers: {
    'User-Agent': 'Pulpy-Postback-Test/1.0',
    'Accept': '*/*',
    'Connection': 'close'
  }
}, (res) => {
  const executionTime = Date.now() - startTime;
  let responseBody = '';

  console.log('✅ Connection established!');
  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Status Message: ${res.statusMessage}`);
  console.log(`📦 Response Headers:`, JSON.stringify(res.headers, null, 2));

  res.on('data', (chunk) => {
    responseBody += chunk.toString();
  });

  res.on('end', () => {
    console.log(`\n⏱️  Execution Time: ${executionTime}ms`);
    console.log(`📄 Response Body (first 500 chars):`);
    console.log(responseBody.substring(0, 500));
    
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\n✅ SUCCESS: Postback URL is working correctly!');
    } else {
      console.log(`\n⚠️  WARNING: Server returned status ${res.statusCode}`);
      console.log('   This might indicate an error on the server side.');
    }
    
    process.exit(0);
  });
});

req.on('error', (err) => {
  const executionTime = Date.now() - startTime;
  console.log('\n❌ ERROR: Connection failed');
  console.log(`   Message: ${err.message}`);
  console.log(`   Code: ${err.code}`);
  console.log(`   Errno: ${err.errno}`);
  console.log(`   Syscall: ${err.syscall}`);
  console.log(`   Address: ${err.address}`);
  console.log(`   Port: ${err.port}`);
  console.log(`\n⏱️  Execution Time: ${executionTime}ms`);
  
  console.log('\n💡 Possible causes:');
  console.log('   - Server is down or unreachable');
  console.log('   - DNS resolution failed');
  console.log('   - Firewall blocking connection');
  console.log('   - SSL certificate issues (for HTTPS)');
  console.log('   - Network connectivity problems');
  
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  const executionTime = Date.now() - startTime;
  console.log(`\n⏰ TIMEOUT: Request timed out after ${POSTBACK_TIMEOUT}ms`);
  console.log(`⏱️  Execution Time: ${executionTime}ms`);
  
  console.log('\n💡 Possible causes:');
  console.log('   - Server is slow or overloaded');
  console.log('   - Network latency is high');
  console.log('   - Server is not responding');
  console.log('   - Firewall is blocking or delaying the connection');
  
  process.exit(1);
});

req.setTimeout(POSTBACK_TIMEOUT);

// Handle socket timeout
req.on('socket', (socket) => {
  socket.setTimeout(POSTBACK_TIMEOUT);
  socket.on('timeout', () => {
    console.log(`\n⏰ SOCKET TIMEOUT: Connection took too long to establish`);
    req.destroy();
    const executionTime = Date.now() - startTime;
    console.log(`⏱️  Execution Time: ${executionTime}ms`);
    process.exit(1);
  });
});

console.log('🔄 Sending request...\n');