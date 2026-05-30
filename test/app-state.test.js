'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createInitialAppState, createAppStateApi } = require('../js/app-state');

describe('app-state', () => {
    it('mutates a single state object via API helpers', () => {
        const state = createInitialAppState();
        const api = createAppStateApi(state);
        Object.assign(state, api);

        state.setSearchOrigin('semiconductor');
        state.setData({ tags: [{ tag_id: 'CL-1' }] });
        state.setSession({ lastReport: { productQuery: 'chip' } });

        assert.equal(state.searchOrigin, 'semiconductor');
        assert.equal(state.data.tags.length, 1);
        assert.equal(state.lastReport.productQuery, 'chip');
    });

    it('resetSession clears ephemeral fields', () => {
        const state = createInitialAppState();
        const api = createAppStateApi(state);
        Object.assign(state, api);

        state.aiContext = { tag_ids: [] };
        state.resetSession();
        assert.equal(state.aiContext, null);
        assert.deepEqual(state.checklistChecked, {});
    });
});
