const { test, expect } = require('@playwright/test');

test.describe('responsive protocol layout', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/*supabase*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.supabase = {
          createClient: () => ({
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              signOut: async () => ({ error: null })
            },
            from: () => ({
              select() { return this; }, eq() { return this; }, order() { return this; },
              limit() { return this; }, then(resolve) {
                return Promise.resolve({ data: [], error: null }).then(resolve);
              }
            }),
            rpc: async () => ({ data: null, error: null })
          })
        };`
      })
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      const gate = document.querySelector('#authGate');
      if (gate) gate.style.display = 'none';
      // Enter the protocol through the same section-opening function used by the UI.
      window.openProtocolSection();
      // The compact mobile layout collapses client details by default.
      const details = document.querySelector('#client')?.closest('details');
      if (details) details.open = true;
    });
  });

  test('main protocol fields fit the mobile viewport without horizontal scrolling', async ({ page }) => {
    await expect(page.locator('#client')).toBeVisible();
    await expect(page.locator('#pno')).toBeVisible();
    await expect(page.locator('#date')).toBeVisible();
    await expect(page.locator('#c1')).toBeVisible();
    await expect(page.locator('#c2')).toBeVisible();
    await expect(page.locator('#m1')).toBeVisible();
    await expect(page.locator('#m2')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test('touch-sized protocol actions remain visible and usable', async ({ page }) => {
    const save = page.getByRole('button', { name: 'Запиши' });
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(32);
    await page.locator('#client').fill('Мобилен тест');
    await expect(page.locator('#client')).toHaveValue('Мобилен тест');
  });
});
