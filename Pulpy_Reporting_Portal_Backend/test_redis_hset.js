
import redis from './src/config/redis.js';

async function test() {
    console.log('Testing hset...');
    const key = `test:hset:${Date.now()}`;
    const data = {
        foo: 'bar',
        baz: 'qux',
        num: '123',
        empty: ''
    };

    try {
        await redis.hset(key, data);
        console.log(`hset called for ${key}`);

        const result = await redis.hgetall(key);
        console.log('Result:', result);

        if (result.foo === 'bar') {
            console.log('✅ hset works with object');
        } else {
            console.log('❌ hset FAILED with object');
        }

        await redis.del(key);
    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit();
}

test();
