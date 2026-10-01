const fs = require('fs');
const lc = [1610, 2200, 1101, 896, 1594, 354, 1670, 302, 1134, 663, 1746, 1194, 4442, 901, 243, 364, 3492, 2728, 10864, 294, 243, 1104, 885, 1669, 1876, 169, 1393, 4391, 2400, 9990];
const op = [1788, 2438, 1212, 991, 1767, 395, 1772, 336, 1253, 731, 1935, 1325, 4935, 1000, 268, 402, 3855, 3029, 12071, 327, 270, 1222, 981, 1842, 2076, 187, 1537, 4886, 2665, 11160];
const uc = [1966, 2688, 1344, 1094, 1948, 402, 1963, 368, 1385, 809, 2134, 1459, 5428, 1101, 295, 443, 4266, 3334, 13278, 358, 296, 1348, 1080, 2038, 2292, 206, 1701, 5366, 2932, 12210];

const content = fs.readFileSync('src/db/database.ts', 'utf8');
const symbols = ['ADANIPORTS', 'ASIANPAINT', 'AXISBANK', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL', 'ETERNAL', 'HCLTECH', 'HDFCBANK', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'NTPC', 'POWERGRID', 'RELIANCE', 'SBIN', 'SUNPHARMA', 'TCS', 'TATASTEEL', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO'];
const names = ['Adani Ports & SEZ', 'Asian Paints', 'Axis Bank', 'Bajaj Finance', 'Bajaj Finserv', 'Bharat Electronics', 'Bharti Airtel', 'Eternal', 'HCLTech', 'HDFC Bank', 'Hindustan Unilever', 'ICICI Bank', 'IndiGo', 'Infosys', 'ITC', 'Kotak Mahindra Bank', 'Larsen & Toubro', 'Mahindra & Mahindra', 'Maruti Suzuki', 'NTPC', 'Power Grid Corp', 'Reliance Industries', 'State Bank of India', 'Sun Pharma', 'Tata Consultancy Services', 'Tata Steel', 'Tech Mahindra', 'Titan Company', 'Trent', 'UltraTech Cement'];

let newArrayStr = '  const actualSecurities = [\n';
for (let i = 0; i < 30; i++) {
  newArrayStr += `    { name: '${names[i]}', symbol: '${symbols[i]}', base_price: ${op[i]}, lower_circuit: ${lc[i]}, upper_circuit: ${uc[i]} }${i < 29 ? ',' : ''}\n`;
}
newArrayStr += '  ];';

const updatedContent = content.replace(/  const actualSecurities = \[\s+[\s\S]*?  \];/m, newArrayStr);
fs.writeFileSync('src/db/database.ts', updatedContent);
console.log('database.ts updated');
