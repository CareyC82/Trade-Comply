const COMPLIANCE_FEEDBACK_MARKER_V1 = 'CFB1:';

const POLICY_TYPE_TO_CODE = {
    'Export control': 'E',
    'Import control': 'I',
    'CCC certification': 'C',
    'No applicable policy': 'N',
    '出口管制': 'E',
    '进口管制': 'I',
    'import_control': 'I',
    'CCC认证': 'C',
    '暂无政策': 'N'
};

function trimField(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, maxLength);
}

function toBase64Url(bytes) {
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function encodePolicyType(value) {
    const trimmed = trimField(value, 64);
    return POLICY_TYPE_TO_CODE[trimmed] || trimmed;
}

function compactRecord(record) {
    return {
        k: trimField(record.product_keyword, 200),
        t: encodePolicyType(record.policy_type),
        u: trimField(record.source_url, 2048),
        m: trimField(record.user_message, 4000)
    };
}

function encodeComplianceFeedbackQuery(record) {
    const compact = compactRecord(record);
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    return `${COMPLIANCE_FEEDBACK_MARKER_V1}${toBase64Url(bytes)}`;
}
