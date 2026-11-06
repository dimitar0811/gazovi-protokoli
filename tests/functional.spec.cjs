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
  // These tests exercise the protocol UI with a mocked Supabase client.
  // The current app intentionally requires sign-in, so hide the sign-in gate
  // for protocol-only tests instead of clicking a removed "offline mode" button.
  await page.locator('#authGate').evaluate(el => { el.style.display = 'none'; });
  await expect(page.locator('#authGate')).toBeHidden();
  // Compact mobile layout keeps client details collapsed initially; open them
  // before interacting with client/site fields.
  const clientDetails = page.locator('#client').locator('xpath=ancestor::details[1]');
  if (await clientDetails.count()) {
    await clientDetails.evaluate(el => { el.open = true; });
  }
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
  await page.locator('#authGate').evaluate(el => { el.style.display = 'none'; });
  await page.locator('#client').evaluate(el => {
    const details = el.closest('details');
    if (details) details.open = true;
  });
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
  await expect(page.locator('#m1').first()).toHaveValue('91.500');
});

test('language switch changes interface language and keeps field values editable', async ({ page }) => {
  await page.locator('#client').fill('Language test');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bg'); // Keep document language stable for Android keyboard behavior.
  await expect(page.locator('#protocolActions')).toContainText('Save');
  await expect(page.locator('#client')).toHaveValue('Language test');
  await page.getByRole('button', { name: 'BG', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bg');
  await expect(page.locator('#client')).toHaveValue('Language test');
  await page.locator('#client').fill('Language test continued');
  await expect(page.locator('#client')).toHaveValue('Language test continued');
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

// Daily gas-presence protocol — independent UI and calculation coverage.
test('daily protocol renders ten editable module rows with changeable identifiers and units', async ({ page }) => {
  await page.goto('/gas-daily.html');
  const rows = page.locator('#modules tr');
  await expect(rows).toHaveCount(10);
  await rows.nth(0).locator('[data-field="number"]').fill('QA-MODULE-01');
  await rows.nth(0).locator('[data-field="pressure"]').fill('12.5');
  await rows.nth(0).locator('[data-field="unit"]').fill('kPa');
  await expect(rows.nth(0).locator('[data-field="number"]')).toHaveValue('QA-MODULE-01');
  await expect(rows.nth(0).locator('[data-field="pressure"]')).toHaveValue('12.5');
  await expect(rows.nth(0).locator('[data-field="unit"]')).toHaveValue('kPa');
});

test('daily protocol calculates total pressure from all entered module readings', async ({ page }) => {
  await page.goto('/gas-daily.html');
  const pressures = page.locator('#modules [data-field="pressure"]');
  await pressures.nth(0).fill('10');
  await pressures.nth(1).fill('12.5');
  await pressures.nth(2).fill('7.25');
  await expect(page.locator('#pressureTotal')).toContainText('29,75');
  await expect(page.locator('#availableGas')).toContainText('29,75');
});

test('daily protocol calculates corrector consumption and updates when readings change', async ({ page }) => {
  await page.goto('/gas-daily.html');
  await page.locator('#previous').fill('100.125');
  await page.locator('#corrector').fill('104.5');
  await expect(page.locator('#consumption')).toContainText('4,375');
  await page.locator('#corrector').fill('105');
  await expect(page.locator('#consumption')).toContainText('4,875');
});

test('daily protocol allows at most five additional module rows and removes an added row', async ({ page }) => {
  await page.goto('/gas-daily.html');
  const add = page.locator('#addModuleRow');
  for (let i = 0; i < 5; i++) await add.click();
  await expect(page.locator('#modules tr')).toHaveCount(15);
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: 'Премахни ред 15' }).click();
  await expect(page.locator('#modules tr')).toHaveCount(14);
  await expect(add).toBeEnabled();
  await expect(add).toContainText('4/5');
});

test('daily protocol magnifier opens, increases zoom and resets to 100 percent', async ({ page }) => {
  await page.goto('/gas-daily.html');
  await page.locator('#magnifierToggle').click();
  await expect(page.locator('#magnifierToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#magnifierControls')).toBeVisible();
  await page.getByRole('button', { name: 'Увеличи увеличението' }).click();
  await expect(page.locator('#zoomValue')).toHaveText('110%');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.locator('#zoomValue')).toHaveText('100%');
});

test('daily protocol keeps editable date, time, location and checker fields', async ({ page }) => {
  await page.goto('/gas-daily.html');
  await page.locator('#pdate').fill('2026-11-06');
  await page.locator('#ptime').fill('18:45');
  await page.locator('#protocolLocation').fill('ТЕСТОВА БАЗА');
  await page.locator('#checker').fill('Тестов проверяващ');
  await expect(page.locator('#pdate')).toHaveValue('2026-11-06');
  await expect(page.locator('#ptime')).toHaveValue('18:45');
  await expect(page.locator('#protocolLocationTitle')).toHaveText('ТЕСТОВА БАЗА');
  await expect(page.locator('#checker')).toHaveValue('Тестов проверяващ');
});

test('daily protocol signature canvas accepts pointer input and clear action resets ink state', async ({ page }) => {
  await page.goto('/gas-daily.html');
  const canvas = page.locator('#signature');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 90, bounds.y + 45, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => hasInk)).toBe(true);
  await page.getByRole('button', { name: 'Изчисти подписа' }).click();
  expect(await page.evaluate(() => hasInk)).toBe(false);
});

test('daily protocol does not claim a cloud save when no authenticated user is present', async ({ page }) => {
  await page.goto('/gas-daily.html');
  await page.evaluate(() => {
    sb.auth.getUser = async () => ({ data: { user: null }, error: null });
  });
  await page.locator('button').filter({ hasText: 'Запиши в архива' }).click();
  await expect(page.locator('#status')).toContainText('Първо влезте в основното приложение');
  await expect(page.locator('#status')).not.toContainText('Протоколът е записан в архива');
});
