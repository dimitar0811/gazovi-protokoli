const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');

test('HTML has mobile viewport and core protocol fields', () => {
  assert.match(html, /name="viewport"/i);
  for (const id of ['client', 'pno', 'date', 'c1', 'c2', 'm1', 'm2', 'notes', 'protocolActions']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing element #' + id);
  }
});

test('inline JavaScript parses without syntax errors', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.ok(scripts.length > 0, 'no inline script found');
  for (const source of scripts) new vm.Script(source);
});

test('Android keyboard language switching is not overridden by app scripts', () => {
  assert.doesNotMatch(html, /function prepareKeyboard\(/);
  assert.doesNotMatch(html, /prepareKeyboard\(\);/);
  assert.doesNotMatch(html, /e\.lang=lang/);
  assert.doesNotMatch(html, /setAttribute\(['"]inputmode['"],['"]text['"]\)/);
  assert.doesNotMatch(html, /addEventListener\(['"](?:touchstart|touchmove|keydown|keyup)['"][^)]*preventDefault/);
});
test('save distinguishes local save from cloud save failure', () => {
  assert.match(html, /async function save\(\)/);
  assert.match(html, /const cloudSaved=await saveCloud\(d\)/);
  assert.match(html, /Протоколът е записан локално, но не и в облака/);
});

test('date formatting and consumption calculations remain present', () => {
  assert.match(html, /function formatBGDate\(v\)/);
  assert.match(html, /function toISODate\(v\)/);
  assert.match(html, /num\('c2'\)-num\('c1'\)/);
  assert.match(html, /num\('m2'\)-num\('m1'\)/);
});

test('login, registration and offline mode are available', () => {
  assert.match(html, /function authMain\(\)/);
  assert.match(html, /function toggleAuthMode\(\)/);
  assert.match(html, /function continueOffline\(\)/);
});
