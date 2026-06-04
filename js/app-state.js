/**
 * Single source of truth for Trade Comply client state.
 * Attach to window.AppState / globalThis.AppState — do not duplicate globals elsewhere.
 */
'use strict';

function createInitialAppState() {
    return {
        data: {
            tags: [],
            cases: [],
            quickActions: [],
            knowledgeBase: {},
            categories: [],
            updates: [],
            catalogSchema: {},
            scopeConfig: {}
        },
        catalog: null,
        currentDirection: 'export',
        currentCountry: 'US',
        routeFromCountry: 'CN',
        routeToCountry: 'US',
        complianceFocus: 'import',
        currentView: 'home',
        searchOrigin: 'electronics',
        lastReport: null,
        aiContext: null,
        preScreenReport: null,
        hsContext: null,
        complianceChecklist: [],
        checklistChecked: {},
        lastApiChecklist: null,
        lastSearch: {
            query: '',
            tagCount: 0,
            caseCount: 0
        }
    };
}

function createAppStateApi(state) {
    return {
        getState() {
            return state;
        },

        setData(dataPatch) {
            if (!dataPatch || typeof dataPatch !== 'object') {
                return state;
            }
            state.data = { ...state.data, ...dataPatch };
            return state;
        },

        setCatalog(catalog) {
            state.catalog = catalog;
            return state;
        },

        setDirection(direction) {
            state.currentDirection = direction === 'import' ? 'import' : 'export';
            return state;
        },

        setCountry(country) {
            state.currentCountry = country || state.currentCountry;
            return state;
        },

        setView(view) {
            state.currentView = view || state.currentView;
            return state;
        },

        setSearchOrigin(origin) {
            state.searchOrigin = origin || 'electronics';
            return state;
        },

        setLastSearch(meta) {
            state.lastSearch = { ...state.lastSearch, ...meta };
            return state;
        },

        setSession(sessionPatch) {
            if (!sessionPatch || typeof sessionPatch !== 'object') {
                return state;
            }
            const sessionKeys = [
                'lastReport',
                'aiContext',
                'preScreenReport',
                'hsContext',
                'complianceChecklist',
                'lastApiChecklist'
            ];
            sessionKeys.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(sessionPatch, key)) {
                    state[key] = sessionPatch[key];
                }
            });
            return state;
        },

        patch(updates) {
            if (!updates || typeof updates !== 'object') {
                return state;
            }
            Object.assign(state, updates);
            return state;
        },

        resetSession() {
            state.lastReport = null;
            state.aiContext = null;
            state.preScreenReport = null;
            state.hsContext = null;
            state.complianceChecklist = [];
            state.checklistChecked = {};
            state.lastApiChecklist = null;
            return state;
        }
    };
}

const state = createInitialAppState();
const AppState = Object.assign(state, createAppStateApi(state));

if (typeof window !== 'undefined') {
    window.AppState = AppState;
}

if (typeof globalThis !== 'undefined') {
    globalThis.AppState = AppState;
    globalThis.TradeComplyAppState = {
        createInitialAppState,
        createAppStateApi
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState, createInitialAppState, createAppStateApi };
}
