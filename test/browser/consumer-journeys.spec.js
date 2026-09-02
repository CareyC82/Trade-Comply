'use strict';

const { test, expect } = require('@playwright/test');

async function submitProduct(page, description) {
    await page.goto('/can-i-sell-it.html');
    await page.getByLabel('Product name or short description').fill(description);
    await page.getByRole('button', { name: 'Show preliminary result' }).click();
    await expect(page.locator('#sell-result')).toBeVisible();
}

test('supported product shows a preliminary result and channel-specific copy', async ({ page }) => {
    await submitProduct(page, 'Bluetooth smart watch with rechargeable lithium battery, no medical claims, for adults');
    await expect(page.locator('#sell-result')).toContainText('FCC authorization');
    await expect(page.locator('#sell-result')).toContainText('UN38.3');
    const amazonReason = await page.locator('#sell-channel-gate-reason').innerText();
    await page.locator('#sell-result-platform').selectOption('TikTok Shop');
    await expect(page.locator('#sell-summary-platform')).toHaveText('TikTok Shop');
    await expect(page.locator('#sell-channel-gate-reason')).toContainText('TikTok Shop');
    await expect(page.locator('#sell-channel-gate-reason')).not.toHaveText(amazonReason);
    await expect(page.locator('.sell-action-summary')).toContainText('Purchase decision:');
    await expect(page.locator('.sell-action-summary')).toContainText('Supplier evidence:');
    await expect(page.locator('.sell-action-summary')).toContainText('Next step:');
});

test('explicitly not designed for children does not trigger a specialist gate', async ({ page }) => {
    await submitProduct(page, 'Bluetooth speaker with rechargeable lithium battery, not designed for children');
    await expect(page.locator('#sell-result')).not.toContainText('High risk — specialist review');
    await expect(page.locator('#sell-result')).toContainText('Conditional');
});

test('wired no-battery products do not inherit radio or lithium actions', async ({ page }) => {
    await submitProduct(page, 'Wired-only USB hub with no battery, no Wi-Fi, no Bluetooth and no AC power, for adults');
    await expect(page.locator('.sell-action-summary')).not.toContainText('UN38.3');
    await expect(page.locator('.sell-action-summary')).toContainText('FCC Part 15B');
    await expect(page.locator('.sell-action-summary')).not.toContainText('FCC ID');
    await expect(page.locator('.sell-action-summary')).not.toContainText('RF exposure');
    await expect(page.locator('.sell-answer-summary')).toContainText('No lithium-battery restriction identified');
});

test('child-directed electronics remain specialist-gated in the actionable summary', async ({ page }) => {
    await submitProduct(page, 'Kids GPS watch with cellular, camera and rechargeable lithium battery');
    await expect(page.locator('#sell-result')).toContainText('High risk — specialist review');
    await expect(page.locator('.sell-action-summary')).toContainText(/DO NOT PURCHASE/i);
    await expect(page.locator('.sell-action-summary')).toContainText(/children|specialist/i);
});

test('unsupported product exits safely and prepares a manual review email', async ({ page }) => {
    await submitProduct(page, 'cotton summer dress');
    await expect(page.locator('#sell-result')).toContainText('Not enough information');
    await expect(page.locator('#sell-result')).toContainText('outside the current electronics');
    const href = await page.locator('#sell-open-review-email').getAttribute('href');
    expect(href).toContain('mailto:carey@tracewize.com');
    expect(decodeURIComponent(href)).toContain('cotton summer dress');
});

test('upload guard blocks too many files before any private transfer', async ({ page }) => {
    await submitProduct(page, 'Wi-Fi smart plug for AC mains, no battery, for adults');
    await page.locator('.sell-advanced-option').first().locator('summary').click();
    const files = Array.from({ length: 6 }, (_, index) => ({
        name: `report-${index}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n${index}\n%%EOF`)
    }));
    await page.locator('#sell-evidence-files').setInputFiles(files);
    await expect(page.locator('#sell-evidence-preview')).toContainText('no more than 5 files');
});

test('mobile result and review actions do not overflow and remain touchable', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile-only geometry assertion.');
    await submitProduct(page, 'Wi-Fi smart plug for AC mains, no battery, for adults');
    const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        actions: [...document.querySelectorAll('.sell-review-actions button,.sell-review-actions a,.sell-check-primary')]
            .filter((element) => element.offsetParent !== null)
            .map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.actions.length).toBeGreaterThan(2);
    geometry.actions.forEach((action) => {
        expect(action.width).toBeGreaterThan(250);
        expect(action.height).toBeGreaterThanOrEqual(40);
    });
});

test('Australia exact tariff selector refreshes the result and links to Post-Entry', async ({ page }) => {
    await page.goto('/can-i-sell-it.html');
    await page.getByLabel('Product name or short description').fill('Portable Bluetooth speaker with rechargeable lithium battery, for adults');
    await page.getByLabel('Target market').selectOption('AU');
    await page.getByRole('button', { name: 'Show preliminary result' }).click();
    await page.locator('.sell-result-details').click();
    const selector = page.locator('[data-exact-tariff-select][data-market="AU"]').first();
    await expect(selector).toBeVisible();
    const value = await selector.locator('option:not([value=""])').first().getAttribute('value');
    await selector.selectOption(value);
    await expect(page.locator('#sell-result')).toContainText('official exact-line match');
    await expect(page.locator('#sell-result')).toContainText('not applied automatically');
    const href = await page.locator('a', { hasText: 'Open in Post-Entry' }).first().getAttribute('href');
    expect(href).toContain(`hs=${value}`);
    expect(href).toContain('to=AU');
});

test('New Zealand exact tariff, supplier request and local report actions stay connected', async ({ page }) => {
    await page.goto('/can-i-sell-it.html');
    await page.getByLabel('Product name or short description').fill('65W GaN USB-C charger with 100-240V AC input, no battery, for adults');
    await page.getByLabel('Target market').selectOption('NZ');
    await page.getByRole('button', { name: 'Show preliminary result' }).click();
    await page.locator('.sell-result-details').click();
    const selector = page.locator('[data-exact-tariff-select][data-market="NZ"]').first();
    await expect(selector).toBeVisible();
    const value = await selector.locator('option:not([value=""])').first().getAttribute('value');
    await selector.selectOption(value);
    await expect(page.locator('#sell-result')).toContainText('New Zealand Customs Service');
    await expect(page.locator('#sell-result')).toContainText('not applied automatically');
    await expect(page.locator('.sell-supplier-request')).toContainText(/electrical|adaptor|tariff/i);
    await expect(page.getByRole('button', { name: 'Download supplier request' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
});

test('ANZ comparison keeps shared evidence and local obligations separate', async ({ page }) => {
    await page.goto('/can-i-sell-it.html');
    await page.getByLabel('Product name or short description').fill('Power bank with rechargeable lithium battery, no wireless, for adults');
    await page.getByLabel('Target market').selectOption('ANZ');
    await page.getByRole('button', { name: 'Show preliminary result' }).click();
    const comparison = page.locator('.sell-anz-comparison');
    await expect(comparison).toContainText('Shared / reusable evidence');
    await expect(comparison).toContainText('Australia-specific actions');
    await expect(comparison).toContainText('New Zealand-specific actions');
    await expect(comparison).toContainText('Not automatically transferable');
    await page.locator('.sell-result-details').click();
    await expect(page.locator('[data-exact-tariff-select][data-market="AU"]').first()).toBeVisible();
    await expect(page.locator('[data-exact-tariff-select][data-market="NZ"]').first()).toBeVisible();
});

test('private workspace failure leaves the anonymous assessment usable', async ({ page }) => {
    await page.route('**/api/consumer/**', (route) => route.abort());
    await submitProduct(page, 'Bluetooth speaker with rechargeable lithium battery');
    await expect(page.locator('#sell-result')).toContainText(/Preliminary market-access result/i);
    await expect(page.locator('#sell-account-message')).toContainText('Private workspace server is unavailable');
});
