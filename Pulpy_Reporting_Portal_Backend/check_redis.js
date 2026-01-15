
import redis from './src/config/redis.js';

async function checkRedis() {
    try {
        console.log("Checking Redis Stream stream:clicks...");
        const stream = await redis.xrange('stream:clicks', '-', '+', 'COUNT', 10);
        console.log(`Stream has ${stream.length} recent entries.`);
        if (stream.length > 0) {
            console.log("Last Entry:", stream[stream.length - 1]);
            const lastId = stream[stream.length - 1][1][1]; // Assuming ID is second field
            console.log(`Checking hash for click ID from stream: ${lastId} ...`);
            // Actually the stream stores field-value pairs: ['id', 'uuid', 'tenant_id', '2']
            // structure: [ timestamp-seq, [ 'id', 'uuid', ... ] ]
            const fields = stream[stream.length - 1][1];
            let clickUuid = null;
            for (let i = 0; i < fields.length; i += 2) {
                if (fields[i] === 'id') clickUuid = fields[i + 1];
            }
            console.log(`Click UUID from Stream: ${clickUuid}`);

            if (clickUuid) {
                const hash = await redis.hgetall(`click:${clickUuid}`);
                console.log("Hash Data:", hash);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkRedis();
