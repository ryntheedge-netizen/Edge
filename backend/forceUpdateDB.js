const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_m7CITpRkVZi2@ep-spring-queen-b3iqo648-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const actualSecurities = [
  { symbol: 'ADANIPORTS', base_price: 1788, lower_circuit: 1610, upper_circuit: 1966 },
  { symbol: 'ASIANPAINT', base_price: 2438, lower_circuit: 2200, upper_circuit: 2688 },
  { symbol: 'AXISBANK', base_price: 1212, lower_circuit: 1101, upper_circuit: 1344 },
  { symbol: 'BAJFINANCE', base_price: 991, lower_circuit: 896, upper_circuit: 1094 },
  { symbol: 'BAJAJFINSV', base_price: 1767, lower_circuit: 1594, upper_circuit: 1948 },
  { symbol: 'BEL', base_price: 395, lower_circuit: 354, upper_circuit: 402 },
  { symbol: 'BHARTIARTL', base_price: 1772, lower_circuit: 1670, upper_circuit: 1963 },
  { symbol: 'ETERNAL', base_price: 336, lower_circuit: 302, upper_circuit: 368 },
  { symbol: 'HCLTECH', base_price: 1253, lower_circuit: 1134, upper_circuit: 1385 },
  { symbol: 'HDFCBANK', base_price: 731, lower_circuit: 663, upper_circuit: 809 },
  { symbol: 'HINDUNILVR', base_price: 1935, lower_circuit: 1746, upper_circuit: 2134 },
  { symbol: 'ICICIBANK', base_price: 1325, lower_circuit: 1194, upper_circuit: 1459 },
  { symbol: 'INDIGO', base_price: 4935, lower_circuit: 4442, upper_circuit: 5428 },
  { symbol: 'INFY', base_price: 1000, lower_circuit: 901, upper_circuit: 1101 },
  { symbol: 'ITC', base_price: 268, lower_circuit: 243, upper_circuit: 295 },
  { symbol: 'KOTAKBANK', base_price: 402, lower_circuit: 364, upper_circuit: 443 },
  { symbol: 'LT', base_price: 3855, lower_circuit: 3492, upper_circuit: 4266 },
  { symbol: 'M&M', base_price: 3029, lower_circuit: 2728, upper_circuit: 3334 },
  { symbol: 'MARUTI', base_price: 12071, lower_circuit: 10864, upper_circuit: 13278 },
  { symbol: 'NTPC', base_price: 327, lower_circuit: 294, upper_circuit: 358 },
  { symbol: 'POWERGRID', base_price: 270, lower_circuit: 243, upper_circuit: 296 },
  { symbol: 'RELIANCE', base_price: 1222, lower_circuit: 1104, upper_circuit: 1348 },
  { symbol: 'SBIN', base_price: 981, lower_circuit: 885, upper_circuit: 1080 },
  { symbol: 'SUNPHARMA', base_price: 1842, lower_circuit: 1669, upper_circuit: 2038 },
  { symbol: 'TCS', base_price: 2076, lower_circuit: 1876, upper_circuit: 2292 },
  { symbol: 'TATASTEEL', base_price: 187, lower_circuit: 169, upper_circuit: 206 },
  { symbol: 'TECHM', base_price: 1537, lower_circuit: 1393, upper_circuit: 1701 },
  { symbol: 'TITAN', base_price: 4886, lower_circuit: 4391, upper_circuit: 5366 },
  { symbol: 'TRENT', base_price: 2665, lower_circuit: 2400, upper_circuit: 2932 },
  { symbol: 'ULTRACEMCO', base_price: 11160, lower_circuit: 9990, upper_circuit: 12210 }
];

async function run() {
  const client = await pool.connect();
  try {
    const eventRes = await client.query('SELECT id FROM events ORDER BY id DESC LIMIT 1');
    if (eventRes.rows.length === 0) return;
    const targetEventId = eventRes.rows[0].id;
    
    console.log('Force updating active event ' + targetEventId);

    for (const data of actualSecurities) {
      await client.query(`
        UPDATE securities
        SET base_price = $1, initial_ltp = $1, current_ltp = $1, lower_circuit = $2, upper_circuit = $3
        WHERE event_id = $4 AND symbol = $5
      `, [data.base_price, data.lower_circuit, data.upper_circuit, targetEventId, data.symbol]);
      
      // Update jobber inventory as well!
      await client.query(`
        UPDATE jobber_inventory
        SET assigned_price = $1
        WHERE security_id = (SELECT id FROM securities WHERE event_id = $2 AND symbol = $3)
      `, [data.base_price, targetEventId, data.symbol]);
    }
    console.log('Done forced update!');
  } finally {
    client.release();
    pool.end();
  }
}
run();
