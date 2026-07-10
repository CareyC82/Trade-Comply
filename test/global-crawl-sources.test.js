'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    GLOBAL_CRAWL_SOURCES,
    getEnabledGlobalSources
} = require('../lib/global-crawl-sources');
const {
    summarizeFetchHealth
} = require('../lib/global-crawl-health');

const REQUIRED_KEYS = ['id', 'country', 'type', 'url', 'method'];

describe('global-crawl-sources', () => {
    it('defines official configuration-driven sources across core jurisdictions', () => {
        assert.equal(GLOBAL_CRAWL_SOURCES.length, 22);
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
            'eu-nonpreferential-origin',
            'eu-us-adjusted-duties-2026',
            'eu-trade',
            'de-zoll',
            'nl-customs',
            'jp-meti',
            'kr-kcs',
            'sg-customs',
            'in-dgft',
            'mx-snice',
            'vn-customs',
            'my-customs',
            'tw-customs',
            'ru-customs'
        ]);
    });

    it('each entry has required global fields', () => {
        for (const entry of GLOBAL_CRAWL_SOURCES) {
            for (const key of REQUIRED_KEYS) {
                assert.ok(entry[key], `${entry.id} missing ${key}`);
            }
            assert.match(entry.country, /^(CN|US|EU|DE|NL|JP|KR|SG|IN|MX|VN|MY|TW|RU)$/);
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
        assert.equal(byId['eu-nonpreferential-origin'].url, 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1422');
        assert.equal(byId['eu-nonpreferential-origin'].type, 'import');
        assert.equal(byId['eu-us-adjusted-duties-2026'].url, 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1455');
        assert.equal(byId['eu-us-adjusted-duties-2026'].type, 'import');
        assert.equal(byId['eu-trade'].url, 'https://policy.trade.ec.europa.eu/news_en');
        assert.equal(byId['de-zoll'].url, 'https://www.zoll.de/EN/Home/home_node.html');
        assert.equal(byId['nl-customs'].url, 'https://www.belastingdienst.nl/wps/wcm/connect/en/customs/customs');
        assert.equal(byId['jp-meti'].url, 'https://www.meti.go.jp/english/press/');
        assert.equal(byId['kr-kcs'].url, 'https://www.customs.go.kr/english/main.do');
        assert.equal(byId['sg-customs'].url, 'https://www.customs.gov.sg/news/');
        assert.equal(byId['in-dgft'].url, 'https://www.dgft.gov.in/CP/?opt=notification');
        assert.equal(byId['mx-snice'].url, 'https://www.snice.gob.mx/');
        assert.equal(byId['vn-customs'].url, 'https://www.customs.gov.vn/');
        assert.equal(byId['my-customs'].url, 'https://mysst.customs.gov.my/');
        assert.equal(byId['tw-customs'].url, 'https://web.customs.gov.tw/');
        assert.equal(byId['ru-customs'].url, 'https://customs.gov.ru/');
    });

    it('getEnabledGlobalSources filters disabled rows', () => {
        const disabled = getEnabledGlobalSources([
            { id: 'x', country: 'US', type: 'both', url: 'https://example.com', method: 'fetch', enabled: false }
        ]);
        assert.equal(disabled.length, 0);
    });

    it('summarizes fetch health by country for admin launch checks', () => {
        const health = summarizeFetchHealth({
            ok: true,
            errors: 1,
            fetched_at: '2026-06-27T00:00:00.000Z',
            sources: [
                { id: 'us-bis', country: 'US', type: 'export', label: 'US BIS', method: 'fetch', url: 'https://example.com/us', ok: true, byte_length: 100, transport: 'fetch' },
                { id: 'jp-meti', country: 'JP', type: 'both', label: 'JP METI', method: 'fetch', url: 'https://example.com/jp', ok: false, error: 'timeout' },
                { id: 'mx-snice', country: 'MX', type: 'both', label: 'Mexico SNICE', method: 'fetch', url: 'https://example.com/mx', ok: true, monitor_only: true, transport: 'official-link-monitor' },
                { id: 'zh-mofcom', country: 'CN', type: 'export', label: 'MOFCOM', method: 'fetch', url: 'https://example.com/mofcom', ok: true, byte_length: 120, transport: 'fetch' },
                { id: 'zh-gac', country: 'CN', type: 'both', label: 'GAC', method: 'got-scraping', url: 'https://example.com/cn', ok: false, optional: true, error: 'blocked' }
            ]
        });

        assert.equal(health.source_count, 5);
        assert.equal(health.ok_count, 3);
        assert.deepEqual(health.countries.map(row => [row.country, row.status]), [
            ['CN', 'ok'],
            ['JP', 'failed'],
            ['MX', 'monitor'],
            ['US', 'ok']
        ]);
        assert.equal(health.sources.find(row => row.id === 'jp-meti').error, 'timeout');
        assert.equal(health.sources.find(row => row.id === 'mx-snice').monitor_only, true);
    });
});
