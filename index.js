const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FRONTEND_ORIGIN = "https://careyc82.github.io";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || FRONTEND_ORIGIN;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const MAX_QUERY_LENGTH = 2000;
const FETCH_TIMEOUT_MS = 30000;

// 允许搜索的关键词范围（从标签数据中提取）
const ALLOWED_KEYWORDS = [
    // CCC 认证相关
    "speaker", "earbuds", "headphones", "audio", "video player", "amplifier",
    "laptop", "tablet", "computer", "server", "router", "switch", "monitor",
    "smartphone", "mobile phone", "modem", "wireless headphones",
    "power bank", "portable charger", "battery pack", "external battery", "mobile power", "powerbank",
    "smart home", "smart plug", "smart bulb", "smart light", "doorbell", "thermostat",
    "smoke detector", "alarm", "sensor", "home automation", "smart lock",
    "dash cam", "dash camera", "car camera", "car dvr", "vehicle camera",
    "car tracker", "gps tracker", "vehicle gps", "obd", "car charger",
    "game console", "gaming console", "playstation", "xbox", "nintendo",
    "game controller", "joystick", "gamepad", "gaming controller", "handheld game", "steam deck",
    "medical device", "blood pressure monitor", "thermometer", "pulse oximeter",
    "glucose meter", "nebulizer", "massager", "medical", "health device", "health monitor",
    "projector", "home projector", "mini projector", "led projector", "portable projector",
    "power adapter", "charger", "usb charger", "power supply", "ac adapter", "dc adapter",
    "wall charger", "fast charger", "gan charger", "charging adapter",
    "ssd", "hard drive", "external hard drive", "usb drive", "usb stick", "flash drive",
    "thumb drive", "portable ssd", "memory card", "sd card",
    "keyboard", "mouse", "computer mouse", "trackpad", "webcam", "web camera", "usb hub", "card reader",
    "vr headset", "ar glasses", "smart glasses", "virtual reality", "augmented reality",
    "mixed reality", "vr goggles", "ar headset", "apple vision", "meta quest", "vr device",
    "vape", "e-cigarette", "electronic cigarette", "vaping device", "vape pen", "vape mod",
    "pod system", "vape cartridge", "e-liquid", "vape juice", "vaporizer",
    "3d printer", "3d printing", "additive manufacturing", "fdm printer", "resin printer",
    "sla printer", "sls printer", "3d printing machine", "filament printer", "metal 3d printer", "industrial 3d printer",
    
    // 无线通信相关
    "wifi", "bluetooth", "wireless", "radio", "zigbee", "nfc", "rfid",
    "smart speaker", "drone", "ip camera",
    "encryption", "encrypted", "crypto", "security", "password", "vpn",
    "smartwatch", "smart watch", "fitness tracker", "wristband", "wearable", "fitbit",
    "apple watch", "galaxy watch", "garmin", "activity tracker", "health tracker", "ring", "smart ring",
    "smart sensor", "motion sensor", "door sensor", "temperature sensor", "humidity sensor", "smart thermostat",
    "wireless keyboard", "wireless mouse", "bluetooth keyboard", "bluetooth mouse", "wireless trackpad", "wireless presenter",
    "walkie talkie", "two way radio", "walkie-talkie", "two-way radio", "handheld radio", "uhf radio",
    "vhf radio", "pmr radio", "dmr radio", "poe radio", "intercom", "long range radio",
    
    // 出口管制相关
    "uav", "infrared", "night vision", "thermal camera", "quadcopter", "unmanned aerial", "multi-rotor",
    "drone camera", "drone gimbal", "thermal camera drone", "drone payload", "drone parts", "uav parts",
    "video transmitter", "video transmission", "drone accessories", "fpv", "first person view",
    "drone flight controller", "drone motor", "drone frame",
    
    // 电池安全相关
    "battery", "lithium", "li-ion",
    "electric scooter", "e-scooter", "hoverboard", "self-balancing scooter", "electric skateboard",
    "e-bike", "electric bicycle", "electric unicycle", "segway", "balance board", "personal mobility",
    
    // 太阳能相关
    "solar panel", "solar inverter", "photovoltaic module", "solar cell", "photovoltaic", "solar energy",
    "solar battery", "solar storage", "solar charger",
    
    // 工业机器人相关
    "industrial robot", "collaborative robot", "cobot", "robot arm", "robot controller",
    "welding robot", "material handling",
    
    // 储能系统相关
    "energy storage", "battery system", "powerwall", "storage inverter", "pcs", "lithium battery", "storage system",
    
    // 税务优惠相关
    "tax refund", "VAT refund", "drawback", "tax rebate", "cost saving", "tax incentive",
    "export tax", "tax benefit", "tax exemption", "duty refund", "customs clearance finance",
    "fiscal incentive", "export benefit",
    
    // HS编码相关
    "8518", "8519", "8521", "8471", "8473", "8517", "8528", "8517.12", "8517.62",
    "8507", "8507.60", "8507.80", "8516", "8526", "8531", "8536", "8525.80", "8525.89",
    "8806", "8807", "8527", "8526.92", "9504.50", "9504.90", "8471.60", "9018", "9019",
    "9020", "9021", "9022", "8528.62", "8528.69", "8504.40", "8504.90", "8471.70",
    "8523.51", "8471.80", "8528.52", "8528.59", "9004.90", "8543.70", "3824.99",
    "8529.90", "8807.30", "8711.60", "8711.90", "9503.00", "8485.20", "8477.80",
    "8485.30", "8525.60", "8541.40", "8541.43", "8479.50", "8428.90", "8537.10"
];

// 检查查询是否在允许的搜索范围内
function checkSearchRange(query) {
    if (!query || typeof query !== 'string') {
        return false;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // 检查是否包含任何允许的关键词
    for (const keyword of ALLOWED_KEYWORDS) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    // 检查是否包含常见的合规相关词汇
    const complianceKeywords = [
        "ccc", "srrc", "认证", "合规", "出口", "进口", "关税", 
        "退税", "管制", "标准", "安全", "电池", "hs", "编码",
        "certification", "compliance", "export", "import", "tax", 
        "regulation", "standard", "safety", "battery", "tariff"
    ];
    
    for (const keyword of complianceKeywords) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    return false;
}

exports.handler = async (event) => {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    // OPTIONS 预检请求
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    // 检查 API Key
    if (!DEEPSEEK_API_KEY) {
        console.error('API Key missing');
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API Key missing" }) };
    }

    // 解析请求 body - 兼容多种触发器格式（包括 Buffer）
    let body = {};
    try {
        console.log('=== Debug Info ===');
        console.log('event instanceof Buffer:', event instanceof Buffer);
        console.log('Buffer.isBuffer(event):', Buffer.isBuffer(event));
        
        // 处理 Buffer 类型的 event
        let rawBody = null;
        
        // 情况1: event 本身是 Buffer
        if (Buffer.isBuffer(event)) {
            console.log('Event is a Buffer');
            rawBody = event.toString('utf-8');
            console.log('Buffer converted to string:', rawBody.slice(0, 200));
        }
        // 情况2: event 是类 Buffer 对象（{type: 'Buffer', data: [...]}）
        else if (event?.type === 'Buffer' && Array.isArray(event?.data)) {
            console.log('Event is a Buffer-like object');
            const buffer = Buffer.from(event.data);
            rawBody = buffer.toString('utf-8');
            console.log('Buffer converted to string:', rawBody.slice(0, 200));
        }
        // 情况3: event.body 是 Buffer
        else if (Buffer.isBuffer(event?.body)) {
            console.log('Body is a Buffer');
            rawBody = event.body.toString('utf-8');
            console.log('Body buffer converted:', rawBody.slice(0, 200));
        }
        // 情况4: event.body 是类 Buffer 对象
        else if (event?.body?.type === 'Buffer' && Array.isArray(event?.body?.data)) {
            console.log('Body is a Buffer-like object');
            const buffer = Buffer.from(event.body.data);
            rawBody = buffer.toString('utf-8');
            console.log('Body buffer converted:', rawBody.slice(0, 200));
        }
        // 情况5: event.body 是普通对象
        else if (typeof event?.body === 'object' && event?.body !== null) {
            console.log('Body is already an object');
            body = event.body;
        }
        // 情况6: event.body 是字符串
        else if (typeof event?.body === 'string') {
            rawBody = event.body;
        }
        // 情况7: event.data 是 Buffer
        else if (Buffer.isBuffer(event?.data)) {
            console.log('Data is a Buffer');
            rawBody = event.data.toString('utf-8');
        }
        // 情况8: event.data 是类 Buffer 对象
        else if (event?.data?.type === 'Buffer' && Array.isArray(event?.data?.data)) {
            console.log('Data is a Buffer-like object');
            const buffer = Buffer.from(event.data.data);
            rawBody = buffer.toString('utf-8');
        }
        // 情况9: event.data 是字符串或对象
        else if (event?.data) {
            if (typeof event.data === 'string') {
                rawBody = event.data;
            } else if (typeof event.data === 'object') {
                body = event.data;
            }
        }
        
        // 如果 rawBody 是字符串，解析为 JSON
        if (typeof rawBody === 'string' && rawBody.trim()) {
            body = JSON.parse(rawBody);
            console.log('Parsed JSON from string');
            
            // 额外处理：如果 body.body 是字符串，说明需要再次解析
            if (typeof body.body === 'string') {
                try {
                    body = JSON.parse(body.body);
                    console.log('Re-parsed nested body:', body);
                } catch (e) {
                    console.log('Nested body is not JSON, keeping as is');
                }
            }
        }
        
        console.log('Final body:', body);
    } catch (e) {
        console.error('Parse error:', e.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON: " + e.message }) };
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    console.log('Final query:', query || '(empty)');

    // 空查询
    if (!query) {
        return { statusCode: 200, headers, body: JSON.stringify({ message: "Service Online" }) };
    }

    // 超长查询
    if (query.length > MAX_QUERY_LENGTH) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Query too long" }) };
    }

    // 检查查询是否在允许的搜索范围内
    const isInRange = checkSearchRange(query);
    if (!isInRange) {
        return { 
            statusCode: 200, 
            headers, 
            body: JSON.stringify({ 
                response: "您的查询不在本网站的贸易合规信息搜索范围内。\n\n本网站主要提供以下类别的贸易合规信息：\n• 电子产品（手机、电脑、耳机等）CCC认证\n• 无线通信设备（蓝牙、WiFi、无人机等）SRRC认证\n• 电池安全与运输规定\n• 太阳能产品进出口合规\n• 工业机器人合规要求\n• 储能系统安全标准\n• 出口管制与两用物项\n• 增值税退税政策\n\n如果您有其他需求或特定产品的合规问题，请留言说明具体产品信息。",
                sources: [],
                outOfRange: true
            }) 
        };
    }

    // 调用 DeepSeek API
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const aiResponse = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY.trim()}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a Chinese trade compliance expert. Reply in the same language as the user query." },
                    { role: "user", content: query }
                ]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error('DeepSeek error:', aiResponse.status, data);
            throw new Error("AI service error: " + (data.error?.message || "Unknown"));
        }

        if (!data?.choices?.[0]?.message?.content) {
            throw new Error("Invalid response structure");
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                response: data.choices[0].message.content,
                sources: []
            })
        };

    } catch (error) {
        console.error('Handler error:', error.message);
        return {
            statusCode: error.name === 'AbortError' ? 504 : 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
