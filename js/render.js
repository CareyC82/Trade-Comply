/**
 * Legacy module slot — results UI split across:
 *   js/render-results.js   orchestration
 *   js/render-mount.js     DOM mounting
 *   js/render-templates.js HTML templates
 *   js/render-prepare.js   view-model preparation
 *   js/search-actions.js   search entry points
 *
 * Global functions (renderResults, searchProducts, …) remain on globalThis for HTML/onclick compatibility.
 */
'use strict';
