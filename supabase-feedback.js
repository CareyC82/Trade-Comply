const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const POLICY_TYPES = new Set(['Export control', 'CCC certification', 'No applicable policy']);

const POLICY_TYPE_ALIASES = {
    '出口管制': 'Export control',
    'CCC认证': 'CCC certification',
    '暂无政策': 'No applicable policy'
};

function normalizePolicyType(value) {
    const trimmed = trimField(value, MAX_LENGTH.policy_type);
    if (POLICY_TYPE_ALIASES[trimmed]) {
        return POLICY_TYPE_ALIASES[trimmed];
    }
    return trimmed;
}

const MAX_LENGTH = {
    product_keyword: 200,
    policy_type: 64,
    source_url: 2048,
    user_message: 4000
};

function trimField(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, maxLength);
}

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function validateComplianceFeedbackPayload(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, statusCode: 400, error: 'Request body must be a JSON object.' };
    }

    const product_keyword = trimField(body.product_keyword, MAX_LENGTH.product_keyword);
    const policy_type = normalizePolicyType(body.policy_type);
    const source_url = trimField(body.source_url, MAX_LENGTH.source_url);
    const user_message = trimField(body.user_message, MAX_LENGTH.user_message);

    if (!product_keyword) {
        return { ok: false, statusCode: 400, error: 'product_keyword is required.' };
    }

    if (!policy_type || !POLICY_TYPES.has(policy_type)) {
        return { ok: false, statusCode: 400, error: 'policy_type must be one of: Export control, CCC certification, No applicable policy.' };
    }

    if (!source_url) {
        return { ok: false, statusCode: 400, error: 'source_url is required.' };
    }

    if (!isValidHttpUrl(source_url)) {
        return { ok: false, statusCode: 400, error: 'source_url must be a valid http(s) URL.' };
    }

    if (!user_message) {
        return { ok: false, statusCode: 400, error: 'user_message is required.' };
    }

    return {
        ok: true,
        record: {
            product_keyword,
            policy_type,
            source_url,
            user_message
        }
    };
}

async function insertComplianceFeedback(record) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase credentials are not configured.');
    }

    const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/compliance_feedback`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify(record)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Supabase insert failed (${response.status}): ${errorText || response.statusText}`);
    }

    return { stored: true };
}

async function handleComplianceFeedbackRequest(body) {
    const validation = validateComplianceFeedbackPayload(body);
    if (!validation.ok) {
        return {
            statusCode: validation.statusCode,
            body: { error: validation.error }
        };
    }

    try {
        await insertComplianceFeedback(validation.record);
        return {
            statusCode: 200,
            body: {
                ok: true,
                message: 'Policy correction submitted successfully.'
            }
        };
    } catch (error) {
        console.error('Supabase compliance_feedback insert failed:', error.message);
        return {
            statusCode: 500,
            body: { error: 'Failed to store policy correction feedback.' }
        };
    }
}

module.exports = {
    POLICY_TYPES,
    validateComplianceFeedbackPayload,
    handleComplianceFeedbackRequest,
    insertComplianceFeedback
};
