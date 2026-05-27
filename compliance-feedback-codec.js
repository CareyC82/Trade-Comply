/**
 * Compliance feedback query codec — shared between browser (encode) and Node/FC (encode + decode).
 */
(function initComplianceFeedbackCodec(root) {
    const MARKER_V1 = 'CFB1:';
    const LEGACY_MARKER_BASE64 = '__COMPLIANCE_FB__';
    const LEGACY_MARKER_JSON = 'COMPLIANCE_FEEDBACK:';
    const LEGACY_MARKER_HEX = 'CFB';

    const POLICY_CODE_TO_TYPE = {
        E: 'Export control',
        I: 'Import control',
        C: 'CCC certification',
        N: 'No applicable policy'
    };

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

    function utf8Bytes(text) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(text);
        }
        return Buffer.from(text, 'utf8');
    }

    function bytesToBase64Url(bytes) {
        let base64;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) {
            base64 = bytes.toString('base64');
        } else {
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            if (typeof btoa !== 'undefined') {
                base64 = btoa(binary);
            } else {
                base64 = Buffer.from(binary, 'binary').toString('base64');
            }
        }
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function fromBase64Url(value) {
        let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const remainder = normalized.length % 4;
        if (remainder) {
            normalized += '='.repeat(4 - remainder);
        }
        return Buffer.from(normalized, 'base64');
    }

    function decodePolicyType(value) {
        const trimmed = trimField(value, 64);
        if (POLICY_CODE_TO_TYPE[trimmed]) {
            return POLICY_CODE_TO_TYPE[trimmed];
        }
        return trimmed;
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

    function expandRecord(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const product_keyword = trimField(
            raw.product_keyword ?? raw.k ?? raw.productKeyword,
            200
        );
        const policy_type = decodePolicyType(raw.policy_type ?? raw.t ?? raw.policyType);
        const source_url = trimField(raw.source_url ?? raw.u ?? raw.sourceUrl, 2048);
        const user_message = trimField(raw.user_message ?? raw.m ?? raw.userMessage, 4000);

        if (!product_keyword && !policy_type && !source_url && !user_message) {
            return null;
        }

        return {
            product_keyword,
            policy_type,
            source_url,
            user_message
        };
    }

    function parseJsonObject(json) {
        try {
            const parsed = JSON.parse(json);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            try {
                const parsed = JSON.parse(json.replace(/\\"/g, '"'));
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (innerError) {
                return null;
            }
        }
    }

    function decodeLegacyHex(encoded) {
        if (!encoded || typeof encoded !== 'string' || encoded.length % 2 !== 0) {
            return null;
        }
        if (!/^[0-9a-fA-F]+$/.test(encoded)) {
            return null;
        }

        try {
            return parseJsonObject(Buffer.from(encoded, 'hex').toString('utf8'));
        } catch (error) {
            return null;
        }
    }

    function decodeLegacyBase64(encoded) {
        if (!encoded || typeof encoded !== 'string') {
            return null;
        }

        try {
            return parseJsonObject(fromBase64Url(encoded).toString('utf8'));
        } catch (error) {
            return null;
        }
    }

    function decodeComplianceFeedbackQuery(query) {
        if (typeof query !== 'string') {
            return null;
        }

        const trimmed = query.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed.startsWith(MARKER_V1)) {
            const encoded = trimmed.slice(MARKER_V1.length);
            if (!encoded) {
                return null;
            }
            try {
                return expandRecord(parseJsonObject(fromBase64Url(encoded).toString('utf8')));
            } catch (error) {
                return null;
            }
        }

        if (trimmed.startsWith(LEGACY_MARKER_BASE64)) {
            return expandRecord(decodeLegacyBase64(trimmed.slice(LEGACY_MARKER_BASE64.length)));
        }

        if (trimmed.startsWith(LEGACY_MARKER_JSON)) {
            return expandRecord(parseJsonObject(trimmed.slice(LEGACY_MARKER_JSON.length)));
        }

        if (trimmed.startsWith(LEGACY_MARKER_HEX)) {
            const remainder = trimmed.slice(LEGACY_MARKER_HEX.length);
            if (!remainder || remainder.startsWith('1:')) {
                return null;
            }
            return expandRecord(decodeLegacyHex(remainder));
        }

        return null;
    }

    function encodeComplianceFeedbackQuery(record) {
        const compact = compactRecord(record);
        const json = JSON.stringify(compact);
        const encoded = bytesToBase64Url(utf8Bytes(json));
        return `${MARKER_V1}${encoded}`;
    }

    function isComplianceFeedbackQuery(query) {
        if (typeof query !== 'string') {
            return false;
        }
        const trimmed = query.trim();
        return trimmed.startsWith(MARKER_V1)
            || trimmed.startsWith(LEGACY_MARKER_BASE64)
            || trimmed.startsWith(LEGACY_MARKER_JSON)
            || (trimmed.startsWith(LEGACY_MARKER_HEX) && !trimmed.startsWith(MARKER_V1));
    }

    function extractComplianceFeedbackPayload(body) {
        if (!body || typeof body !== 'object') {
            return null;
        }

        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (query) {
            const decoded = decodeComplianceFeedbackQuery(query);
            if (decoded) {
                return decoded;
            }
        }

        if (query === 'COMPLIANCE_FEEDBACK' && body.context && typeof body.context === 'object') {
            return expandRecord(body.context);
        }

        if (body.action === 'compliance_feedback' || body.product_keyword || body.policy_type || body.source_url) {
            return expandRecord(body);
        }

        return null;
    }

    root.encodeComplianceFeedbackQuery = encodeComplianceFeedbackQuery;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            MARKER_V1,
            encodeComplianceFeedbackQuery,
            decodeComplianceFeedbackQuery,
            extractComplianceFeedbackPayload,
            expandRecord,
            isComplianceFeedbackQuery
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
