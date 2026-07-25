'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseChinaCustomsEnvelope,
    queryChinaCustomsTariffs,
    buildChinaCustomsExactPayload
} = require('../lib/china-customs-tariff');

test('parses the China Customs public tariff response envelope', () => {
    const parsed = parseChinaCustomsEnvelope({
        res: '{statue:1,message:"查询成功",totalCount:1,data:[{"codeTs":"8542311100","gName":"模块","impDiscountRate":"0","impOrdinaryRate":"30%","impTempRate":""}]}'
    });
    assert.equal(parsed.totalCount, 1);
    assert.equal(parsed.data[0].codeTs, '8542311100');
});

test('rejects incomplete China Customs pagination', async () => {
    let calls = 0;
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
            res: calls++ === 0
                ? '{statue:1,message:"查询成功",totalCount:2,data:[{"codeTs":"8542311100","gName":"模块","impDiscountRate":"0"}]}'
                : '{statue:1,message:"查询成功",totalCount:2,data:[]}'
        })
    });
    await assert.rejects(
        () => queryChinaCustomsTariffs('854231', { fetchImpl, pageSize: 100 }),
        /incomplete/
    );
});

test('builds a complete normalized exact-line payload from official rows', async () => {
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
            res: '{statue:1,message:"查询成功",totalCount:1,data:[{"codeTs":"8542311100","gName":"模块","impDiscountRate":"0","impOrdinaryRate":"30%","impTempRate":""}]}'
        })
    });
    const payload = await buildChinaCustomsExactPayload(['854231'], {
        fetchImpl,
        date: '2026-07-25'
    });
    assert.equal(payload.complete, true);
    assert.equal(payload.rows[0].hs_code, '8542311100');
    assert.equal(payload.rows[0].mfn_rate, '0');
    assert.match(payload.source.url, /^https:\/\/online\.customs\.gov\.cn\//);
});
