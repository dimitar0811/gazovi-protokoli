const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Isolate the suite from Supabase and production data.
  await page.route('**/*supabase*', route => route.fulfill({
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
  }));
  await page.addInitScript(() => { window.alert = () => {}; window.confirm = () => true; });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    const gate = document.querySelector('#authGate');
    if (gate) gate.style.display = 'none';
    window.openProtocolSection();
  });
});

test('protocol archive survives reload and can reopen the saved record', async ({ page }) => {
  await page.locator('#client').fill('QA Archive Fixture');
  await page.locator('#pno').fill('TEST-ARCHIVE-001');

  const saved = await page.evaluate(() => window.saveSilently());
  expect(saved).toBe(true);

  const beforeReload = await page.evaluate(() => window.archiveData());
  expect(beforeReload).toHaveLength(1);
  expect(beforeReload[0].pno).toBe('TEST-ARCHIVE-001');
  expect(beforeReload[0].client).toBe('QA Archive Fixture');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openArchived === 'function' && typeof window.openProtocolSection === 'function');
  await page.evaluate(() => {
    const gate = document.querySelector('#authGate');
    if (gate) gate.style.display = 'none';
    window.openProtocolSection();
    window.openArchived(0);
  });

  await expect(page.locator('#client')).toHaveValue('QA Archive Fixture');
  await expect(page.locator('#pno')).toHaveValue('TEST-ARCHIVE-001');
});

test('generated PDF blob is stored and can be read back from IndexedDB', async ({ page }) => {
  const stored = await page.evaluate(async () => {
    // Stub only PDF rendering so this test isolates the actual IndexedDB persistence path.
    window.buildOnePagePdf = async () => new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const record = { pno: 'TEST-PDF-001', client: 'PDF Archive Fixture' };
    const ok = await window.saveProtocolPdf(record);
    if (!ok) throw new Error('PDF save did not return success');

    const db = await window.openPdfArchiveDb();
    try {
      const item = await new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readonly');
        const request = tx.objectStore('pdfs').get('TEST-PDF-001');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (!item?.blob) throw new Error('No PDF blob was found in IndexedDB');
      return {
        pno: item.pno,
        filename: item.filename,
        mime: item.blob.type,
        bytes: Array.from(new Uint8Array(await item.blob.arrayBuffer()))
      };
    } finally {
      db.close();
    }
  });

  expect(stored.pno).toBe('TEST-PDF-001');
  expect(stored.filename).toContain('TEST-PDF-001');
  expect(stored.mime).toBe('application/pdf');
  expect(stored.bytes).toEqual([37, 80, 68, 70, 45, 49, 46, 55]);
});
