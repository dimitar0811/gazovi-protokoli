const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Keep tests independent of external services and never write to production data.
  await page.route('**/supabase-js@2**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) }
    }) };`,
  }));
  await page.route('**/api.open-meteo.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: { temperature_2m: 12.3 } }),
  }));
  await page.goto('/gas-daily.html');
});

test('показва 10 реда с редактиращи се полета за модулите', async ({ page }) => {
  const rows = page.locator('#modules tr');
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(0).locator('[data-field="number"]')).toBeEditable();
  await expect(rows.nth(0).locator('[data-field="pressure"]')).toBeEditable();
  await expect(rows.nth(0).locator('[data-field="unit"]')).toBeEditable();
});

test('позволява промяна на номер, налягане и мерна единица', async ({ page }) => {
  const row = page.locator('#modules tr').first();
  await row.locator('[data-field="number"]').fill('CH-01');
  await row.locator('[data-field="pressure"]').fill('2,5');
  await row.locator('[data-field="unit"]').fill('bar');
  await expect(row.locator('[data-field="number"]')).toHaveValue('CH-01');
  await expect(row.locator('[data-field="pressure"]')).toHaveValue('2,5');
  await expect(row.locator('[data-field="unit"]')).toHaveValue('bar');
});

test('изчислява общия сбор на наляганията с десетична запетая', async ({ page }) => {
  const pressures = page.locator('#modules [data-field="pressure"]');
  await pressures.nth(0).fill('1,5');
  await pressures.nth(1).fill('2,25');
  await expect(page.locator('#pressureTotal')).toHaveText('3,75');
  await expect(page.locator('#availableGas')).toHaveText('3,75');
});

test('изчислява разхода от текущото и предишното показание', async ({ page }) => {
  await page.locator('#previous').fill('100,5');
  await page.locator('#corrector').fill('125,75');
  await expect(page.locator('#consumption')).toHaveText('25,25');
});

test('позволява до 15 модула и блокира добавянето на шестнадесети', async ({ page }) => {
  const add = page.locator('#addModuleRow');
  for (let i = 0; i < 5; i++) await add.click();
  await expect(page.locator('#modules tr')).toHaveCount(15);
  await expect(add).toBeDisabled();
  await expect(add).toContainText('5/5');
});

test('премахва допълнителен ред и актуализира брояча', async ({ page }) => {
  await page.locator('#addModuleRow').click();
  await expect(page.locator('#modules tr')).toHaveCount(11);
  await page.getByRole('button', { name: 'Премахни ред 11' }).click();
  await expect(page.locator('#modules tr')).toHaveCount(10);
  await expect(page.locator('#addModuleRow')).toContainText('0/5');
});

test('обновява заглавието при промяна на базата', async ({ page }) => {
  await page.locator('#protocolLocation').fill('ПАМПОРОВО');
  await expect(page.locator('#protocolLocationTitle')).toHaveText('ПАМПОРОВО');
});

test('лупата отваря контролите и увеличението може да се промени', async ({ page }) => {
  await page.locator('#magnifierToggle').click();
  await expect(page.locator('#magnifierToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#magnifierControls')).toBeVisible();
  await page.getByRole('button', { name: 'Увеличи увеличението' }).click();
  await expect(page.locator('#zoomValue')).toHaveText('110%');
  await page.getByRole('button', { name: '100%' }).click();
  await expect(page.locator('#zoomValue')).toHaveText('100%');
});

test('записът без вписан потребител показва ясно съобщение', async ({ page }) => {
  await page.getByRole('button', { name: 'Запиши в архива' }).click();
  await expect(page.locator('#status')).toContainText('Първо влезте в основното приложение');
});

test('полето за подпис приема рисуване с показалеца', async ({ page }) => {
  const canvas = page.locator('#signature');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 80, bounds.y + 45, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#signature')).toBeVisible();
  await expect(page.locator('.signature-actions button')).toBeEnabled();
});

test('мобилният изглед не създава хоризонтално преливане на страницата', async ({ page }) => {
  await page.setViewportSize({ width:  AndroidWidth(), height: 800 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
});

function AndroidWidth() { return 390; }
