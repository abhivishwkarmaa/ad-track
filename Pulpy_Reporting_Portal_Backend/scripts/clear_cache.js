import redis from '../src/config/redis.js';

async function clearCache() {
  try {
    await redis.flushall();
    console.log('Redis cache cleared successfully!');
  } catch (err) {
    console.error('Error clearing cache:', err);
  } finally {
    process.exit(0);
  }
}

clearCache();
