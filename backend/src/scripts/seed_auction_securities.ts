import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:edge@localhost:5432/edge_db',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech') 
    ? { rejectUnauthorized: false } 
    : false
});

const data = `
1   AU Small Finance Bank Ltd.                                           0.57%
2   Cholamandalam Investment and Finance Company Ltd.                   48.81%
3   Bosch Ltd.                                                          57.02%
4   GMR Airports Ltd.                                                   87.8%
5   HCL Technologies Ltd.                                               45.29%
6   Hindustan Petroleum Corporation Ltd.                               117.58%
7   Infosys Ltd.                                                         8.7%
8   JSW Steel Ltd.                                                      22.19%
9   UPL Ltd.                                                            -36.13%
10  360 ONE WAM Ltd.                                                    64%
11  AIA Engineering Ltd.                                                33.05%
12  Canara Robeco Bluechip Equity Fund (30) CANARA ROBECO LARGE CAP FUND 34.82%
13  Japanese Yen                                                        -11.02%
14  Dogecoin                                                             172.94%
15  silver                                                               395%
16  Container Corporation of India Ltd.                                  53.76%
17  PI Industries Ltd.                                                   30.33%
18  Mazagoan Dock Shipbuilders Ltd.                                     187.06%
19  Ajanta Pharmaceuticals Ltd.                                          85.73%
20  Oil India Ltd.                                                      138.1%
21  Oracle Financial Services Software Ltd.                              174.79%
22  Adani Power Ltd.                                                     180.14%
23  Samvardhana Motherson International Ltd.                              74.19%
24  Cochin Shipyard Ltd.                                                   84.34%
25  Tube Investments of India Ltd.                                       45.99%
26  KPIT Technologies Ltd.                                                83.82%
27  HDFC Flexi Cap Fund                                                   44.1%
28  South African Rand                                                   -4.31%
29  Steem                                                                60.09%
30  Coffee                                                               -4.55%
31  Multi Commodity Exchange of India Ltd.                               122.7%
32  Bajaj Holdings & Investment Ltd.                                      44.27%
33  NTPC Ltd.                                                            93.08%
34  Trent Ltd.                                                          191.01%
35  Sundaram Finance Ltd.                                                74.64%
36  3M India Ltd.                                                        38.04%
37  NHPC Ltd.                                                           127.17%
38  Thermax Ltd.                                                         80.24%
39  Voltas Ltd.                                                          34.57%
40  Biocon Ltd.                                                          26.89%
41  Bank of Maharashtra                                                  147.18%
42  HDFC Large Cap Fund                                                  40.14%
43  Swiss Franc                                                           2.9%
44  Stellar                                                               32.93%
45  NATURAL GAS                                                          -33.83%
46  Godrej Consumer Products Ltd.                                        30.31%
47  Torrent Power Ltd.                                                  163.89%
48  Eicher Motors Ltd.                                                   35.02%
49  APL Apollo Tubes Ltd.                                                27.22%
50  Godfrey Phillips India Ltd.                                          77.18%
51  Dixon Technologies (India) Ltd.                                     158.63%
52  ACC Ltd.                                                             46.34%
53  NMDC Ltd.                                                            88.82%
54  UltraTech Cement Ltd.                                                28.1%
55  Glaxosmithkline Pharmaceuticals Ltd.                                52.84%
56  Godrej Properties Ltd.                                               120%
57  Sundaram Large & Mid Cap Fund                                        40.11%
58  Australian Dollar                                                     -0.89%
59  Monero                                                                -16.92%
60  Gasoline                                                              1.57%
61  Bank of Baroda                                                        59.31%
62  Cummins India Ltd.                                                   89.21%
63  Bajaj Finance Ltd.                                                   27.3%
64  Torrent Pharmaceuticals Ltd.                                         70.23%
65  Radico Khaitan Ltd                                                   46.92%
66  TVS Motor Company Ltd.                                               99.11%
67  MphasiS Ltd.                                                         35.62%
68  IDFC First Bank Ltd.                                                 35.73%
69  Bajaj Auto Ltd.                                                     132.57%
70  LIC Housing Finance Ltd.                                             85.71%
71  Ambuja Cements Ltd.                                                  64.05%
72  Aditya Birla Sun Life Infrastructure Equity                          59.67%
73  United States Dollar                                                   1.46%
74  Dai                                                                    1.51%
75  Corn                                                                 -31.55%
76  Glenmark Pharmaceuticals Ltd.                                      100.41%
77  Adani Ports and Special Economic Zone Ltd.                          114.53%
78  Laurus Labs Ltd.                                                     29.31%
79  The New India Assurance Company Ltd.                                131.81%
80  InterGlobe Aviation Ltd.                                              86.77%
81  Havells India Ltd.                                                   28.05%
82  UNO Minda Ltd.                                                       47.31%
83  Coforge Ltd.                                                         44.84%
84  Tata Elxsi Ltd.                                                      30.52%
85  Union Bank of India                                                  131%
86  Bharat Petroleum Corporation Ltd.                                    90.15%
87  Motilal Oswal Midcap Fund                                             62.14%
88  Canadian Dollar                                                        1.5%
89  Chainlink                                                              157.75%
90  Platinum                                                              -5.02%
91  Punjab National Bank                                                  164.1%
92  SBI Life Insurance Company Ltd.                                       36.16%
93  State Bank of India                                                   44.97%
94  Bharat Forge Ltd.                                                    47.51%
95  Shriram Finance Ltd.                                                 87.32%
96  Zydus Lifesciences Ltd.                                              105.8%
97  Vodafone Idea Ltd.                                                   115.45%
98  Tata Motors Passenger Vehicles Ltd.                                 134.48%
99  BSE Ltd.                                                             462.38%
100 Canara Bank                                                          106.49%
101 Apollo Tyres Ltd.                                                    45.9%
102 Tata Large & Mid Cap Fund                                             35.12%
103 Thai Baht                                                             -5.03%
104 Litecoin                                                              15.24%
105 BRENT CRUDE                                                           10.37%
106 Aurobindo Pharma Ltd.                                                110.1%
107 Linde India Ltd.                                                     58.56%
108 Fortis Healthcare Ltd.                                                60.4%
109 Nestle India Ltd.                                                    -85.43%
110 Jindal Steel Ltd.                                                    56.4%
111 Kalyan Jewellers India Ltd.                                          305.01%
112 Steel Authority of India Ltd.                                         61.99%
113 Muthoot Finance Ltd.                                                 53.12%
114 Bharat Electronics Ltd.                                              110.66%
115 J.K. Cement Ltd.                                                     40.44%
116 Prestige Estates Projects Ltd.                                      184.31%
117 Franklin India Bluechip Fund (107) FRANKLINE INDIA LARGE CAP FUND 32.53%
118 New Zealand Dollar                                                    -2.95%
119 Ethereum                                                             103.3%
120 Lithium                                                             -56.57%
121 Supreme Industries Ltd.                                               69.46%
122 Hero MotoCorp Ltd.                                                    99.8%
123 Tata Communications Ltd.                                              62.83%
124 Power Finance Corporation Ltd.                                        161.69%
125 Info Edge (India) Ltd.                                                 51.82%
126 Cipla Ltd.                                                             68.88%
127 Coal India Ltd.                                                       108.31%
128 SJVN Ltd.                                                             272.68%
129 Max Financial Services Ltd.                                            57.99%
130 Tata Power Co. Ltd.                                                  104.28%
131 Ipca Laboratories Ltd.                                                 52.95%
132 Aditya Birla Sun Life Banking and Financial Services Fund               31.63%
133 Euro                                                                   0.75%
134 DigiByte                                                               61.96%
135 Uranium                                                               78.83%
136 Indian Oil Corporation Ltd.                                           126.77%
137 Colgate Palmolive (India) Ltd.                                         80.61%
138 Bank of India                                                           83.08%
139 Bharat Dynamics Ltd.                                                   77.75%
140 Maruti Suzuki India Ltd.                                                49.24%
141 Apar Industries Ltd.                                                   170.01%
142 HDFC Asset Management Company Ltd.                                    119.78%
143 Pidilite Industries Ltd.                                                 29.99%
144 Tata Steel Ltd.                                                        53.17%
145 Mahindra & Mahindra Ltd.                                                65.62%
146 Jindal Stainless Ltd.                                                  141.3%
147 ICICI Prudential Technology Fund                                        31.26%
148 Swedish Krona                                                           -1.41%
149 Counterparty                                                           219.89%
150 GOLD                                                                    14.45%
151 Dr. Reddy's Laboratories Ltd.                                           33.1%
152 IndusInd Bank Ltd.                                                      45.26%
153 ICICI Lombard General Insurance Company Ltd.                             56.99%
154 CG Power and Industrial Solutions Ltd.                                  82.74%
155 Oil & Natural Gas Corporation Ltd.                                       81.13%
156 Indian Railway Catering And Tourism Corporation Ltd.                      63.81%
157 Apollo Hospitals Enterprise Ltd.                                          50.48%
158 Astral Ltd.                                                              49.3%
159 Yes Bank Ltd.                                                            51.14%
160 Alkem Laboratories Ltd.                                                  46.69%
161 Power Grid Corporation of India Ltd.                                     29.19%
162 Kotak Bluechip Fund (140) KOTAK LARGE CAP FUND                            33.88%
163 Chinese Yuan                                                             -3.5%
164 XRP (Ripple)                                                              25.29%
165 Tea                                                                       1.46%
166 Bharti Airtel Ltd.                                                       62.07%
167 National Aluminium Co. Ltd.                                               96.92%
168 L&T Technology Services Ltd.                                              60.97%
169 Grasim Industries Ltd.                                                   41.12%
170 DLF Ltd.                                                                 149.2%
171 Escorts Kubota Ltd.                                                      48.71%
172 Polycab India Ltd.                                                        71.78%
173 REC Ltd.                                                                 298.25%
174 Bajaj Finserv Ltd.                                                        28.19%
175 Indian Bank                                                               82.42%
176 General Insurance Corporation of India                                   147.3%
177 Kotak Large & Midcap Fund                                                42.51%
178 Singapore Dollar                                                           0.18%
179 Cardano                                                                    67.92%
180 CRUDEOIL                                                                   11.27%
181 Max Healthcare Institute Ltd.                                             89.72%
182 CRISIL Ltd.                                                                59.37%
183 Indian Railway Finance Corporation Ltd.                                  417.45%
184 Godrej Industries Ltd.                                                   89.32%
185 L&T Finance Ltd.                                                          91.34%
186 Larsen & Toubro Ltd.                                                      74.82%
187 Rail Vikas Nigam Ltd.                                                    238.46%
188 Phoenix Mills Ltd.                                                       111.09%
189 Oberoi Realty Ltd.                                                        75.62%
190 NLC India Ltd.                                                           199.61%
191 MRF Ltd.                                                                  58.25%
192 Parag Parikh Flexi Cap Fund                                               41.13%
193 South Korean Won                                                          -1.43%
194 Bitcoin                                                                   154.33%
195 Coal                                                                      -28.73%
196 Tata Consumer Products Ltd.                                               54.05%
197 Motilal Oswal Financial Services Ltd.                                    168.13%
198 Patanjali Foods Ltd.                                                      37.21%
199 HDFC Life Insurance Company Ltd.                                          26.12%
200 Adani Green Energy Ltd.                                                  119.14%
201 Sun Pharmaceutical Industries Ltd.                                        66.8%
202 Indus Towers Ltd.                                                        102.75%
203 Wipro Ltd.                                                                 30.75%
204 Adani Enterprises Ltd.                                                    86.22%
205 Nippon Life India Asset Management Ltd.                                  124.35%
206 Indian Hotels Co. Ltd.                                                    84.44%
207 Invesco India Large & Mid Cap Fund                                         52.06%
208 Hong Kong Dollar                                                            1.77%
209 Solana                                                                     788.61%
210 Cocoa                                                                     161.57%
211 ABB India Ltd.                                                             88.87%
212 Hitachi Energy India Ltd.                                                 111.85%
213 JSW Energy Ltd.                                                           112.11%
214 GAIL (India) Ltd.                                                           76.91%
215 Endurance Technologies Ltd.                                                47%
216 Tata Investment Corporation Ltd.                                           254.86%
217 Suzlon Energy Ltd.                                                         398.77%
218 Solar Industries India Ltd.                                                135.2%
219 United Spirits Ltd.                                                       51.64%
220 Avenue Supermarts Ltd.                                                     27.35%
221 Bharat Heavy Electricals Ltd.                                               254.87%
222 Canara Robeco Equity Hybrid Fund                                           28.79%
223 Pakistani Rupee                                                             -0.54%
224 Binance Coin                                                                92.85%
225 Iron Ore                                                                   -13.24%
`;

export async function seedAuctionSecurities(client: any) {
  try {
    const lines = data.trim().split('\n').filter(l => l.trim().length > 0);
    
    // First, clear existing auction securities just in case
    await client.query('TRUNCATE TABLE auction_securities CASCADE');

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const line of lines) {
      // Each line has: [code] [name... name] [returnPct]%
      // regex to parse:
      const match = line.match(/^(\d+)\s+(.+?)\s+([\-0-9.]+)\%$/);
      if (match) {
        const code = match[1];
        const name = match[2].trim();
        const returnPct = parseFloat(match[3]);
        
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(code, name, returnPct);
      } else {
        console.error('Failed to parse line:', line);
      }
    }
    
    if (values.length > 0) {
      const query = `
        INSERT INTO auction_securities (code, name, return_pct)
        VALUES ${placeholders.join(', ')}
      `;
      await client.query(query, values);
    }
    
    const count = await client.query('SELECT COUNT(*) FROM auction_securities');
    console.log(`Successfully loaded ${count.rows[0].count} auction securities.`);
    
  } catch (err) {
    console.error('Error seeding data', err);
  }
}
