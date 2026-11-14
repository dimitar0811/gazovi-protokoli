const { test, expect } = require('@playwright/test');

const records = [
  { pno: 'MON-20261114-001', date: '2026-11-14', client: 'Тест Клиент', eik: '123456789', site: 'Чепеларе', tech: 'Иван', cbm: 'C-1', cs: '100', cd: '2026-11-14', c1: '10', c2: '12', cv: '2', mbm: 'M-1', ms: '200', md: '2026-11-14', m1: '20', m2: '22', mv: '2', notes: 'Тест & проверка', accounting_status: 'pending' }
];

const supabaseStub = `const records = [{"pno":"MON-20261114-001","date":"2026-11-14","client":"Тест Клиент","eik":"123456789","site":"Чепеларе","tech":"Иван","cbm":"C-1","cs":"100","cd":"2026-11-14","c1":"10","c2":"12","cv":"2","mbm":"M-1","ms":"200","md":"2026-11-14","m1":"20","m2":"22","mv":"2","notes":"Тест & проверка","accounting_status":"pending"}];\nwindow.supabase = {
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'accounting@example.test' } }, error: null }) },
    rpc: async name => name === 'check_app_access'
      ? ({ data: { approved: true, role: 'accounting' }, error: null })
      : ({ data: null, error: null }),
    from: () => ({
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      then(resolve) { resolve({ data: records, error: null }); }
    })
  })
};`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gasCompanyId', 'company-1'));
  await page.route('**/supabase-js@2*', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseStub })
  );
  await page.goto('/accounting-export.html');
});

test('accounting export loads only accounting-role protocol records', async ({ page }) => {
  await expect(page.locator('#list')).toContainText('Тест Клиент');
  await expect(page.locator('#xmlBtn')).toBeDisabled();
});

test('selecting a protocol enables XML and CSV exports', async ({ page }) => {
  await page.locator('#list input[type=checkbox]').check();
  await expect(page.locator('#xmlBtn')).toBeEnabled();
  await expect(page.locator('#csvBtn')).toBeEnabled();
});

test('XML export starts a download for the selected protocol', async ({ page }) => {
  await page.locator('#list input[type=checkbox]').check();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#xmlBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xml$/);
  await expect(page.locator('#status')).toContainText('XML експорт за 1 протокола');
});

test('search filters protocol rows', async ({ page }) => {
  await page.locator('#search').fill('няма такъв клиент');
  await expect(page.locator('#list')).toContainText('Няма протоколи');
});
