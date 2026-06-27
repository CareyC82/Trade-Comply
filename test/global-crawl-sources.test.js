'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    GLOBAL_CRAWL_SOURCES,
    getEnabledGlobalSources
} = require('../lib/global-crawl-sources');

const REQUIRED_KEYS = ['id', 'country', 'type', 'url', 'method'];

describe('global-crawl-sources', () => {
    it('defines official configuration-driven sources across core jurisdictions', () => {
        assert.equal(GLOBAL_CRAWL_SOURCES.length, 14);
        const ids = GLOBAL_CRAWL_SOURCES.map((row) => row.id);
        assert.deepEqual(ids, [
            'zh-mofcom',
            'zh-gac',
            'us-bis',
            'us-cbp',
            'us-ustr',
            'us-ofac',
            'us-fcc',
            'eu-lex',
            'eu-trade',
            'jp-meti',
            'kr-kcs',
            'sg-customs',
            'in-dgft',
            'mx-snice'
        ]);
    });

    it('each entry has required global fields', () => {
        for (const entry of GLOBAL_CRAWL_SOURCES) {
            for (const key of REQUIRED_KEYS) {
                assert.ok(entry[key], `${entry.id} missing ${key}`);
            }
            assert.match(entry.country, /^(CN|US|EU|JP|KR|SG|IN|MX)$/);
            assert.match(entry.type, /^(import|export|both)$/);
            assert.match(entry.method, /^(fetch|got-scraping)$/);
        }
    });

    it('uses specified official URLs', () => {
        const byId = Object.fromEntries(GLOBAL_CRAWL_SOURCES.map((row) => [row.id, row]));
        assert.equal(byId['zh-mofcom'].url, 'https://www.mofcom.gov.cn/zwgk/zcfb/');
        assert.equal(byId['zh-gac'].method, 'got-scraping');
        assert.equal(byId['us-cbp'].url, 'https://www.cbp.gov/trade/automated/newsflash');
        assert.equal(byId['us-ustr'].url, 'https://ustr.gov/issue-areas/enforcement/section-301-investigations/tariff-actions');
        assert.equal(byId['us-ofac'].url, 'https://ofac.treasury.gov/recent-actions');
        assert.equal(byId['us-fcc'].url, 'https://www.fcc.gov/news-events/headlines');
        assert.equal(byId['eu-lex'].url, 'https://eur-lex.europa.eu/homepage.html?ihcl=en');
        assert.equal(byId['eu-trade'].url, 'https://policy.trade.ec.europa.eu/news_en');
        assert.equal(byId['jp-meti'].url, 'https://www.meti.go.jp/english/press/');
        assert.equal(byId['kr-kcs'].url, 'https://www.customs.go.kr/english/main.do');
        assert.equal(byId['sg-customs'].url, 'https://www.customs.gov.sg/news-and-media/circulars/');
        assert.equal(byId['in-dgft'].url, 'https://www.dgft.gov.in/CP/?opt=notification');
        assert.equal(byId['mx-snice'].url, 'https://www.snice.gob.mx/');
    });

    it('getEnabledGlobalSources filters disabled rows', () => {
        const disabled = getEnabledGlobalSources([
            { id: 'x', country: 'US', type: 'both', url: 'https://example.com', method: 'fetch', enabled: false }
        ]);
        assert.equal(disabled.length, 0);
    });
});
