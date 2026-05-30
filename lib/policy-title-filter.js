/**
 * Hard-coded administrative noise blacklist for policy announcement titles.
 */
'use strict';

/** 行政杂音黑名单 — 标题命中任一词则跳过 */
const NOISE_BLACKLIST = [
    '年度报告', '年度报表', '网站工作', '工作年报',
    '主题教育', '学习贯彻', '精神', '深入学习',
    '会见', '外事', '代表团', '会谈',
    '人事任免', '任免', '招录', '招聘', '公告栏',
    '机关子站', '专题专栏', '征求意见'
];

function titleMatchesNoise(title) {
    const line = String(title || '').trim();
    if (!line) {
        return false;
    }
    return NOISE_BLACKLIST.some((keyword) => line.includes(keyword));
}

/**
 * Split normalized crawl text into dated headline entries (title + date + full line).
 */
function extractDatedHeadlines(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return [];
    }

    const dateMatches = [...normalized.matchAll(/\d{4}-\d{2}-\d{2}/g)];
    if (dateMatches.length === 0) {
        return [];
    }

    const headlines = [];
    const seenLines = new Set();

    for (let index = 0; index < dateMatches.length; index += 1) {
        const date = dateMatches[index][0];
        const dateIdx = dateMatches[index].index;
        const nextIdx = index + 1 < dateMatches.length
            ? dateMatches[index + 1].index
            : normalized.length;
        const prevDateEnd = index > 0
            ? dateMatches[index - 1].index + dateMatches[index - 1][0].length
            : Math.max(0, dateIdx - 120);
        const title = normalized.slice(prevDateEnd, dateIdx).replace(/\s+/g, ' ').trim();
        const line = normalized.slice(Math.max(0, dateIdx - 20), nextIdx).replace(/\s+/g, ' ').trim();
        const displayLine = `${title} ${date}`.trim();
        if (!displayLine || seenLines.has(displayLine)) {
            continue;
        }
        seenLines.add(displayLine);
        headlines.push({
            line: displayLine,
            date,
            title: title || displayLine
        });
        if (headlines.length >= 80) {
            break;
        }
    }

    return headlines;
}

/**
 * @param {string} text
 * @returns {{ text: string, kept: object[], skipped: object[], stats: object }}
 */
function applyNoiseFilterToPolicyText(text) {
    const headlines = extractDatedHeadlines(text);

    if (headlines.length === 0) {
        const normalized = String(text || '').replace(/\s+/g, ' ').trim();
        let lineChunks = normalized.split(/(?<=[。；;])\s*/).map((s) => s.trim()).filter((s) => s.length >= 8);
        if (lineChunks.length <= 1 && normalized.length > 40) {
            const phraseChunks = normalized.match(/[\u4e00-\u9fa5A-Za-z0-9（）()、《》\-·]{8,120}/g) || [];
            const spaceChunks = normalized.split(/\s+/).map((s) => s.trim()).filter((s) => s.length >= 4);
            const merged = [...new Set([...phraseChunks, ...spaceChunks].map((s) => s.trim()))];
            if (merged.length >= 3) {
                lineChunks = merged;
            }
        }
        if (lineChunks.length > 1) {
            const kept = [];
            const skipped = [];
            for (const line of lineChunks) {
                if (titleMatchesNoise(line)) {
                    skipped.push({ line, title: line, reason: 'blacklist-line' });
                } else {
                    kept.push({ line, title: line });
                }
            }
            return {
                text: kept.map((row) => row.line).join('\n'),
                kept,
                skipped,
                stats: { mode: 'line-chunks', total: lineChunks.length, kept: kept.length, skipped: skipped.length }
            };
        }
        return {
            text: normalized,
            kept: [],
            skipped: [],
            stats: { mode: 'passthrough', total: 0, kept: 0, skipped: 0 }
        };
    }

    const kept = [];
    const skipped = [];
    for (const entry of headlines) {
        if (titleMatchesNoise(entry.title) || titleMatchesNoise(entry.line)) {
            skipped.push({ ...entry, reason: 'blacklist' });
        } else {
            kept.push(entry);
        }
    }

    const filteredText = kept.map((row) => row.line).join('\n');
    return {
        text: filteredText,
        kept,
        skipped,
        stats: {
            mode: 'dated-headlines',
            total: headlines.length,
            kept: kept.length,
            skipped: skipped.length
        }
    };
}

function truncateLine(text, max) {
    const line = String(text || '').replace(/\s+/g, ' ').trim();
    if (line.length <= max) {
        return line;
    }
    return `${line.slice(0, max - 3)}...`;
}

/**
 * Build LLM digest from blacklist-filtered headlines only.
 */
function extractFilteredAnnouncementDigest(text, maxChars = 4500) {
    const { text: filtered, stats, skipped } = applyNoiseFilterToPolicyText(text);
    if (!filtered) {
        return { digest: '', stats, skipped };
    }
    const digest = filtered.length <= maxChars ? filtered : `${filtered.slice(0, maxChars - 3)}...`;
    return { digest, stats, skipped };
}

module.exports = {
    NOISE_BLACKLIST,
    titleMatchesNoise,
    extractDatedHeadlines,
    applyNoiseFilterToPolicyText,
    extractFilteredAnnouncementDigest
};
