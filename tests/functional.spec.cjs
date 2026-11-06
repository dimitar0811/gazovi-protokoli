const { test, expect } = require('@playwright/test');

const supabaseStub = `window.supabase = {
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null })
    },
    from: () => ({
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      range() { return Promise.resolve({ data: [], error: null }); },
      insert() { return this; },
      update() { return this; },
      delete() { return this; },
      single: async () => ({ data: null, error: null })
    })
  })
};`;

test.beforeEach(async ({ page }) => {
  await page.route('**/supabase-js@2*', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseStub })
  );
  await page.route('https://api.open-meteo.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ current: { temperature_2m: 8.5 } })
    })
  );
  await page.goto('/gas-daily.html');
  await expect(page.locator('#modules tr')).toHaveCount(10);
});

test('daily protocol starts with exactly ten module rows', async ({ page }) => {
  await expect(page.locator('#modules tr')).toHaveCount(10);
  await expect(page.locator('#addModuleRow')).toContainText('0/5');
});

test('each module row exposes editable number, pressure and unit fields', async ({ page }) => {
  const row = page.locator('#modules tr').nth(0);
  await row.locator('[data-field="number"]').fill('QA-01');
  await row.locator('[data-field="pressure"]').fill('12.5');
  await row.locator('[data-field="unit"]').fill('kPa');
  await expect(row.locator('[data-field="number"]')).toHaveValue('QA-01');
  await expect(row.locator('[data-field="pressure"]')).toHaveValue('12.5');
  await expect(row.locator('[data-field="unit"]')).toHaveValue('kPa');
});

test('module pressure total adds all numeric readings', async ({ page }) => {
  const pressure = page.locator('#modules [data-field="pressure"]');
  await pressure.nth(0).fill('10');
  await pressure.nth(1).fill('12.5');
  await pressure.nth(2).fill('7.25');
  await expect(page.locator('#pressureTotal')).toHaveText('29,75');
  await expect(page.locator('#availableGas')).toHaveText('29,75');
});

test('module pressure total updates when an existing reading changes', async ({ page }) => {
  const pressure = page.locator('#modules [data-field="pressure"]');
  await pressure.nth(0).fill('10');
  await pressure.nth(1).fill('5');
  await expect(page.locator('#pressureTotal')).toHaveText('15');
  await pressure.nth(0).fill('20');
  await expect(page.locator('#pressureTotal')).toHaveText('25');
});

test('empty module pressure readings show a dash instead of a false zero', async ({ page }) => {
  await expect(page.locator('#pressureTotal')).toHaveText('—');
  await expect(page.locator('#availableGas')).toHaveText('—');
});

test('corrector consumption is calculated from current minus previous reading', async ({ page }) => {
  await page.locator('#previous').fill('100.125');
  await page.locator('#corrector').fill('104.5');
  await expect(page.locator('#consumption')).toHaveText('4,375');
});

test('corrector readings accept decimal commas', async ({ page }) => {
  await page.locator('#previous').fill('10,25');
  await page.locator('#corrector').fill('12,75');
  await expect(page.locator('#consumption')).toHaveText('2,5');
});

test('corrector consumption recalculates immediately after a reading changes', async ({ page }) => {
  await page.locator('#previous').fill('20');
  await page.locator('#corrector').fill('25');
  await expect(page.locator('#consumption')).toHaveText('5');
  await page.locator('#corrector').fill('27.5');
  await expect(page.locator('#consumption')).toHaveText('7,5');
});

test('daily protocol date and time are initialized and remain editable', async ({ page }) => {
  await expect(page.locator('#pdate')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#ptime')).toHaveValue(/^\d{2}:\d{2}$/);
  await page.locator('#pdate').fill('2026-11-06');
  await page.locator('#ptime').fill('18:45');
  await expect(page.locator('#pdate')).toHaveValue('2026-11-06');
  await expect(page.locator('#ptime')).toHaveValue('18:45');
});

test('editing the base location updates the protocol heading in uppercase', async ({ page }) => {
  await page.locator('#protocolLocation').fill('ТЕСТОВА БАЗА');
  await expect(page.locator('#protocolLocationTitle')).toHaveText('ТЕСТОВА БАЗА');
});

test('the add-row control allows five additional module rows', async ({ page }) => {
  const add = page.locator('#addModuleRow');
  for (let i = 0; i < 5; i++) await add.click();
  await expect(page.locator('#modules tr')).toHaveCount(15);
  await expect(add).toBeDisabled();
  await expect(add).toContainText('5/5');
});

test('removing an additional module row restores the row limit and numbering', async ({ page }) => {
  await page.locator('#addModuleRow').click();
  await expect(page.locator('#modules tr')).toHaveCount(11);
  await page.getByRole('button', { name: 'Премахни ред 11' }).click();
  await expect(page.locator('#modules tr')).toHaveCount(10);
  await expect(page.locator('#addModuleRow')).toBeEnabled();
  await expect(page.locator('#addModuleRow')).toContainText('0/5');
});

test('magnifier opens, increases zoom and resets to one hundred percent', async ({ page }) => {
  await page.locator('#magnifierToggle').click();
  await expect(page.locator('#magnifierControls')).toBeVisible();
  await expect(page.locator('#magnifierToggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Увеличи увеличението' }).click();
  await expect(page.locator('#zoomValue')).toHaveText('110%');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.locator('#zoomValue')).toHaveText('100%');
});

test('signature canvas records pointer input and clear action resets it', async ({ page }) => {
  const canvas = page.locator('#signature');
  await canvas.click({ position: { x: 30, y: 30 } });
  expect(await page.evaluate(() => hasInk)).toBe(true);
  await page.getByRole('button', { name: 'Изчисти подписа' }).click();
  expect(await page.evaluate(() => hasInk)).toBe(false);
});

test('saving without an authenticated user shows the sign-in requirement', async ({ page }) => {
  await page.locator('#pdate').fill('2026-11-06');
  await page.getByRole('button', { name: 'Запиши в архива' }).click();
  await expect(page.locator('#status')).toContainText('Първо влезте в основното приложение');
  await expect(page.locator('#status')).not.toContainText('Протоколът е записан в архива');
});
