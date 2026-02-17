
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00' // Matches application config
});

async function runDebug() {
    const tenantId = 5;
    // Hardcoded date based on user report: 2026-02-17
    const dateStr = '2026-02-17';
    const tzOffset = 330; // 5.5 hours

    console.log(`Debug Run for Tenant: ${tenantId}, Date: ${dateStr}`);

    try {
        // 1. RAW COUNT (User's Query Logic)
        // User query: created_at > '2026-02-17 00:00:00'. Note: this is UTC if running against UTC DB.
        // But user implies this matches Dashboard Cards (188).
        // Let's see what the app query (IST shifted) returns.

        const [rawRows] = await pool.query(
            `SELECT count(*) as count FROM conversions WHERE created_at > ? AND tenant_id = ?`,
            [`${dateStr} 00:00:00`, tenantId]
        );
        console.log(`\n1. User SQL (UTC > 00:00): ${rawRows[0].count}`);

        // 2. DASHBOARD CARDS LOGIC
        // WHERE DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= '2026-02-17' 
        // AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) <= '2026-02-17'
        const [cardRows] = await pool.query(
            `SELECT count(*) as count 
             FROM conversions 
             WHERE DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= ? 
               AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) <= ?
               AND tenant_id = ?`,
            [dateStr, dateStr, tenantId]
        );
        console.log(`2. Dashboard Cards (IST Day): ${cardRows[0].count}`);

        // 3. PERFORMANCE CHART LOGIC (Hourly grouping)
        // Same WHERE clause, but grouped.
        const [chartRows] = await pool.query(
            `SELECT 
               DATE_FORMAT(DATE_ADD(created_at, INTERVAL 330 MINUTE), '%Y-%m-%d %H:00') as date_group,
               COUNT(*) as count
             FROM conversions
             WHERE DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= ?
               AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) <= ?
               AND tenant_id = ?
             GROUP BY date_group
             ORDER BY date_group ASC`,
            [dateStr, dateStr, tenantId]
        );

        let chartTotal = 0;
        console.log('\n3. Performance Chart (Hourly Buckets):');
        chartRows.forEach(r => {
            console.log(`   ${r.date_group}: ${r.count}`);
            chartTotal += parseInt(r.count);
        });
        console.log(`   TOTAL SUM: ${chartTotal}`);

        // 4. FIND THE MISSING ROWS
        // If chartTotal < cardCount, let's find rows that fit Cards but not Chart.
        if (chartTotal < cardRows[0].count) {
            console.log('\n⚠️  DISCREPANCY DETECTED!');
            console.log('Searching for rows that are counted in Cards but dropped in Group By...');

            // Get ALL valid rows for Cards
            const [allRows] = await pool.query(
                `SELECT conversion_uuid, created_at, 
                        DATE_ADD(created_at, INTERVAL 330 MINUTE) as ist_time,
                        DATE_FORMAT(DATE_ADD(created_at, INTERVAL 330 MINUTE), '%Y-%m-%d %H:00') as group_key
                 FROM conversions 
                 WHERE DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= ? 
                   AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) <= ?
                   AND tenant_id = ?`,
                [dateStr, dateStr, tenantId]
            );

            const buckets = new Set(chartRows.map(r => r.date_group));
            const missing = allRows.filter(r => !buckets.has(r.group_key));

            if (missing.length > 0) {
                console.log(`FAILED ROWS (${missing.length}):`);
                missing.forEach(r => console.log(JSON.stringify(r)));
            } else {
                console.log('No rows missing from buckets. Math error?');
            }
        } else {
            console.log('\n✅ No discrepancy found in strict SQL. Issue requires frontend/API context.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

runDebug();
