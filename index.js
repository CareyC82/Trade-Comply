const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FRONTEND_ORIGIN = "https://careyc82.github.io";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || FRONTEND_ORIGIN;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const MAX_QUERY_LENGTH = 2000;
const FETCH_TIMEOUT_MS = 30000;

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

    // 解析请求 body
    let body = {};
    try {
        console.log('=== Debug Info ===');
        console.log('event.body type:', typeof event.body);
        console.log('event.body:', event.body);
        console.log('event.isBase64Encoded:', event.isBase64Encoded);
        
        if (!event.body) {
            console.log('No body found');
        } else if (typeof event.body === 'object') {
            // 已经是解析后的对象
            body = event.body;
            console.log('Body is already an object');
        } else if (typeof event.body === 'string') {
            // 是字符串，尝试解析
            const trimmed = event.body.trim();
            if (trimmed) {
                body = JSON.parse(trimmed);
                console.log('Parsed from string');
            }
        }
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
