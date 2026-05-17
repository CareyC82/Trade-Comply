const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ALLOWED_ORIGIN = "https://careyc82.github.io";
const MAX_QUERY_LENGTH = 500;
const TIMEOUT_MS = 30000;

const ALLOWED_KEYWORDS = [
    // 半导体相关
    "chip", "semiconductor", "integrated circuit", "ic", "gpu", "ai chip", "hbm", "dram", "nand",
    "cpu", "processor", "wafer", "foundry", "lithography", "etching", "eda", "chiplet", "3d ic",
    "advanced packaging", "silicon photonics", "optical interconnect", "fabless", "inference accelerator",
    "NVIDIA", "H200", "RTX Pro", "finfet", "gaa", "tape-out", "gdsii",
    // 电子产品相关
    "phone", "mobile", "smartphone", "iphone", "android", "cellular",
    "laptop", "computer", "pc", "notebook", "tablet", "ipad",
    "headphone", "earphone", "earbud", "headset", "airpod",
    "speaker", "audio", "sound", "microphone",
    "camera", "webcam", "ip camera", "cctv", "surveillance",
    "drone", "uav", "quadcopter", "unmanned aerial vehicle",
    "battery", "lithium", "li-ion", "power bank", "charger",
    "wireless", "wifi", "bluetooth", "rf", "radio", "nfc", "zigbee",
    "iot", "smart device", "smart home", "smart watch", "wearable",
    "solar", "photovoltaic", "pv panel", "inverter",
    "robot", "robotic", "industrial robot", "automation",
    "sensor", "lidar", "radar", "infrared", "thermal",
    "display", "monitor", "screen", "lcd", "oled",
    "printer", "3d printer", "fdm", "resin printer",
    "router", "modem", "network", "switch",
    "storage", "ssd", "hard drive", "memory",
    "encryption", "encrypted", "crypto", "vpn",
    "export", "import", "customs", "tariff", "vat",
    "ccc", "srrc", "certification", "compliance",
    "optical", "fiber", "module", "transceiver",
    "walkie", "talkie", "two-way radio",
    "earbuds", "headphones", "tws",
    "机器人", "无人机", "电池", "太阳能", "储能", "耳机", "蓝牙耳机", "打印机", "光模块",
    "industrial", "energy", "optical", "fdm printer", "server", "servers",
    "electric bicycle", "e-bike", "ebike", "electric bike",
    "电动自行车", "电单车"
];

function checkSearchRange(query) {
    const queryLower = query.toLowerCase();
    for (const keyword of ALLOWED_KEYWORDS) {
        if (queryLower.includes(keyword)) {
            return true;
        }
    }
    return false;
}

const messages = {
    en: {
        outOfRange: "Your query is outside the scope of this website's trade compliance information search.\n\nThis website mainly provides trade compliance information for the following categories:\n• Electronics (mobile phones, computers, headphones, etc.) CCC certification\n• Wireless communication devices (Bluetooth, WiFi, drones, etc.) SRRC certification\n• Battery safety and transportation regulations\n• Solar product import/export compliance\n• Industrial robot compliance requirements\n• Energy storage system safety standards\n• Export controls and dual-use items\n• VAT refund policies\n\nIf you have other needs or specific product compliance questions, please leave a message with details about the product.",
        systemPrompt: `You are a cautious Chinese trade compliance expert. Answer questions ONLY about China's import/export regulations. Never give legal advice. Always reply in English.

CRITICAL - Response Structure:
Structure your entire response using this exact format:

1. REGULATORY REQUIREMENTS
For each applicable regulation (e.g., CCC, SRRC), explain:
   a) What it is
   b) Official source
   c) Basic penalty risk

2. EXEMPTIONS & CONDITIONS
Explain any exemptions, special conditions, or thresholds that may apply.

3. HIDDEN RISKS (Dual-Use & Scenario Analysis)
Act as a risk detective. Based on the product's features, identify potential hidden compliance risks:
   - Could certain specs trigger dual-use controls?
   - Are there end-use or end-user concerns (e.g., military, surveillance)?
   - Any new regulations (e.g., 2026 Japan controls, supply chain rules) that might apply?
   - Data security issues (e.g., biometric data collection)?

4. COMPLIANCE STRATEGY
Provide actionable guidance:
   - What documents should the exporter prepare?
   - What official sources should they check?
   - What steps can reduce customs risk?

CRITICAL - Rules:
- ONLY cover China trade regulations. NEVER mention FCC, CE, FDA, RoHS, WEEE, UL, etc.
- If asked about non-China regulations, respond: "Sorry, I only cover China's trade compliance regulations."
- Keep each section concise but specific.`
    },
    zh: {
        outOfRange: "您的查询不在本网站的贸易合规信息搜索范围内。\n\n本网站主要提供以下类别的贸易合规信息：\n• 电子产品（手机、电脑、耳机等）CCC认证\n• 无线通信设备（蓝牙、WiFi、无人机等）SRRC认证\n• 电池安全与运输规定\n• 太阳能产品进出口合规\n• 工业机器人合规要求\n• 储能系统安全标准\n• 出口管制与两用物项\n• 增值税退税政策\n\n如果您有其他需求或特定产品的合规问题，请留言说明具体产品信息。",
        systemPrompt: `You are a cautious Chinese trade compliance expert. Answer questions ONLY about China's import/export regulations. Never give legal advice. Always reply in Chinese.

CRITICAL - Response Structure:
Structure your entire response using this exact format:

1. REGULATORY REQUIREMENTS
For each applicable regulation (e.g., CCC, SRRC), explain:
   a) What it is
   b) Official source
   c) Basic penalty risk

2. EXEMPTIONS & CONDITIONS
Explain any exemptions, special conditions, or thresholds that may apply.

3. HIDDEN RISKS (Dual-Use & Scenario Analysis)
Act as a risk detective. Based on the product's features, identify potential hidden compliance risks:
   - Could certain specs trigger dual-use controls?
   - Are there end-use or end-user concerns (e.g., military, surveillance)?
   - Any new regulations (e.g., 2026 Japan controls, supply chain rules) that might apply?
   - Data security issues (e.g., biometric data collection)?

4. COMPLIANCE STRATEGY
Provide actionable guidance:
   - What documents should the exporter prepare?
   - What official sources should they check?
   - What steps can reduce customs risk?

CRITICAL - Rules:
- ONLY cover China trade regulations. NEVER mention FCC, CE, FDA, RoHS, WEEE, UL, etc.
- If asked about non-China regulations, respond: "Sorry, I only cover China's trade compliance regulations."
- Keep each section concise but specific.`
    }
};

function getLangConfig(language) {
    return messages[language] || messages.en;
}

exports.handler = async (event) => {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    if (!DEEPSEEK_API_KEY) {
        console.error('DEEPSEEK_API_KEY not set');
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
    }

    let body;
    let rawBody;

    try {
        if (event.body) {
            if (typeof event.body === 'string') {
                rawBody = event.body;
            } else if (Buffer.isBuffer(event.body)) {
                rawBody = event.body.toString('utf-8');
            } else if (typeof event.body === 'object') {
                body = event.body;
            }
        }
        else if (event?.type === 'Buffer' && Array.isArray(event?.data)) {
            const buffer = Buffer.from(event.data);
            rawBody = buffer.toString('utf-8');
        }
        else if (Buffer.isBuffer(event)) {
            rawBody = event.toString('utf-8');
        }
        else if (typeof event === 'string' && event.trim().startsWith('{')) {
            rawBody = event;
        }
        
        if (typeof rawBody === 'string' && rawBody.trim()) {
            console.log('Raw body:', rawBody.slice(0, 500));
            body = JSON.parse(rawBody);
            console.log('Parsed body:', body);
            
            if (body?.body && typeof body.body === 'string') {
                try {
                    const nested = JSON.parse(body.body);
                    if (nested?.query) {
                        body = nested;
                        console.log('Nested body parsed:', body);
                    }
                } catch (e) {
                }
            }
        }
        
        console.log('Final body:', body);
    } catch (e) {
        console.error('Parse error:', e.message);
        console.error('Stack:', e.stack);
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON: " + e.message }) };
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const language = typeof body.language === 'string' ? body.language.trim().toLowerCase() : 'en';
    console.log('Final query:', query || '(empty)');
    console.log('Language:', language);

    const langConfig = getLangConfig(language);

    if (!query) {
        return { statusCode: 200, headers, body: JSON.stringify({ message: "Service Online" }) };
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Query too long" }) };
    }

    const isInRange = checkSearchRange(query);
    console.log('isInRange:', isInRange, 'query:', query);
    
    if (!isInRange) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: langConfig.outOfRange
            })
        };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: langConfig.systemPrompt },
                    { role: 'user', content: query }
                ],
                temperature: 0.3,
                max_tokens: 1500
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API error:', response.status, errorText);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: `DeepSeek API error: ${response.status}` })
            };
        }

        const data = await response.json();
        console.log('DeepSeek response:', JSON.stringify(data).slice(0, 500));

        const assistantMessage = data.choices?.[0]?.message?.content || "No response generated";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: assistantMessage
            })
        };

    } catch (error) {
        console.error('Error calling DeepSeek:', error.message);
        console.error('Stack:', error.stack);
        
        if (error.name === 'AbortError') {
            return {
                statusCode: 504,
                headers,
                body: JSON.stringify({ error: "Request timeout" })
            };
        }
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to process request: " + error.message })
        };
    }
};
