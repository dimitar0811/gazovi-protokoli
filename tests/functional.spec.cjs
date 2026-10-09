const { test, expect } = require('@playwright/test');

const supabaseStub = `
window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Mock login rejected' } })
    },
    from: () => {
      const q = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        limit() { return this; }, upsert: async () => ({ error: null }),
        delete() { return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); }
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null })
  })
};
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/supabase-js@2', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseStub })
  );
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: /Работа без вход/i }).click();
  await expect(page.locator('#authGate')).toBeHidden();
});

test('required client validation prevents saving an empty protocol', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Запиши' }).click();
  await expect(page.locator('#client')).toBeVisible();
  await expect(page.locator('#pno')).toHaveValue('');
  await expect(page.locator('#gasProtocolArchive')).toHaveCount(0);
});

test('calculates corrector and meter consumption to three decimals', async ({ page }) => {
  await page.locator('#c1').fill('10.125');
  await page.locator('#c2').fill('14.5');
  await page.locator('#m1').fill('20');
  await page.locator('#m2').fill('23.456');
  await expect(page.locator('#cu')).toContainText('4.375 m³');
  await expect(page.locator('#mu')).toContainText('3.456 m³');
});

test('saves a protocol locally and places it in the archive', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#client').fill('Тестова фирма');
  await page.locator('#site').fill('Тестов обект');
  await page.locator('#c1').fill('100');
  await page.locator('#c2').fill('105.25');
  await page.getByRole('button', { name: 'Запиши' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gasProtocolArchive') || '[]').length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gasProtocolV2') || '{}'));
  expect(saved.client).toBe('Тестова фирма');
  expect(saved.site).toBe('Тестов обект');
  expect(saved.cUsage).toBeCloseTo(5.25);
  expect(saved.pno).toMatch(/^GP-/);
});

test('saved protocol survives reload and can be opened from archive', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#client').fill('Фирма за повторение');
  await page.locator('#c1').fill('2');
  await page.locator('#c2').fill('7');
  await page.getByRole('button', { name: 'Запиши' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gasProtocolV2'))).toContain('Фирма за повторение');
  await page.reload();
  await page.getByRole('button', { name: /Работа без вход/i }).click();
  await page.getByRole('button', { name: 'Архив' }).click();
  await expect(page.locator('#archiveList')).toContainText('Фирма за повторение');
  await page.getByRole('button', { name: 'Отвори' }).first().click();
  await expect(page.locator('#client')).toHaveValue('Фирма за повторение');
});

test('new protocol carries over the same client and previous readings', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#client').fill('Постоянен клиент');
  await page.locator('#c2').fill('45.125');
  await page.locator('#m2').fill('91.500');
  await page.getByRole('button', { name: 'Запиши' }).click();
  await page.getByRole('button', { name: 'Нов протокол' }).click();
  await expect(page.locator('#client')).toHaveValue('Постоянен клиент');
  await expect(page.locator('#c1')).toHaveValue('45.125');
  await expect(page.locator('#m1')).toHaveValue('91.500');
});

test('language switch changes interface language without removing input focus', async ({ page }) => {
  await page.locator('#client').focus();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#client')).toBeFocused();
  await expect(page.locator('#protocolActions')).toContainText('Save');
  await page.getByRole('button', { name: 'BG', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bg');
  await expect(page.locator('#client')).toBeFocused();
});

test('registration mode shows password confirmation and validates mismatch', async ({ page }) => {
  await page.getByRole('button', { name: 'Изход' }).count().then(async n => {
    if (n) await page.getByRole('button', { name: 'Изход' }).click();
    else await page.evaluate(() => { document.querySelector('#authGate').style.display = 'flex'; });
  });
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await expect(page.locator('#authPassword2')).toBeVisible();
  await page.locator('#authEmail').fill('qa@example.test');
  await page.locator('#authPassword').fill('first-password');
  await page.locator('#authPassword2').fill('different-password');
  await page.getByRole('button', { name: 'Регистрация' }).last().click();
  await expect(page.locator('#authMsg')).toContainText('Паролите не съвпадат');
});
