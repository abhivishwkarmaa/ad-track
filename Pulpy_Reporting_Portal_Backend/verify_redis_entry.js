
import redis from './src/config/redis.js';

const UUID = process.argv[2] || 'IW13Ssqspn9Nhb727lpeF1KhU4_xr4akX1wz';
const STREAM_KEY = 'stream:clicks';

async function verify() {
    console.log(`Verifying UUID: ${UUID}`);

    // Check Stream
    const streamData = await redis.xrange(STREAM_KEY, '-', '+');
    console.log(`Stream Length: ${streamData.length}`);
    let foundInStream = false;
    for (const [id, fields] of streamData) {
        // fields is array [key1, val1, key2, val2...]
        for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === 'id' && fields[i + 1] === UUID) {
                console.log(`✅ Found in Stream at ID: ${id}`);
                foundInStream = true;
            }
        }
    }
    if (!foundInStream) console.log('❌ NOT found in Stream');

    // Check Hash
    const hashKey = `click:${UUID}`;
    const hashData = await redis.hgetall(hashKey);
    console.log(`Hash Key: ${hashKey}`);
    console.log(`Hash Data:`, hashData);
    if (Object.keys(hashData).length === 0) {
        console.log('❌ Hash is EMPTY');
    } else {
        console.log('✅ Hash has data');
    }

    process.exit();
}

verify();
