
import redis from './src/config/redis.js';

async function testPipeline() {
    console.log('Testing pipeline.hset...');
    const key = `test:pipeline:hset:${Date.now()}`;
    const data = {
        foo: 'bar',
        baz: 'qux',
        num: '123'
    };

    try {
        const pipeline = redis.pipeline();
        pipeline.hset(key, data);
        const results = await pipeline.exec();
        console.log('Pipeline Results:', results);

        const result = await redis.hgetall(key);
        console.log('HGETALL Result:', result);

        if (result.foo === 'bar') {
            console.log('✅ pipeline.hset works with object');
        } else {
            console.log('❌ pipeline.hset FAILED with object');
        }

        await redis.del(key);
    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit();
}

testPipeline();
