
import redis from './src/config/redis.js';

async function checkDLQ() {
    try {
        console.log("Checking Redis Stream stream:clicks:dlq...");
        const stream = await redis.xrevrange('stream:clicks:dlq', '+', '-', 'COUNT', 10);
        console.log(`DLQ has ${stream.length} recent entries.`);
        if (stream.length > 0) {
            console.log("Last DLQ Entry:", JSON.stringify(stream[0]));
        } else {
            console.log("Empty DLQ.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkDLQ();
