// React dan DOM asli, transport terisolasi. Tidak memakai server atau data acara.
// Jalankan: node tests/admin-refresh.browser.mjs (Edge Windows), atau atur BROWSER_PATH.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const edge = process.env.BROWSER_PATH || (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '');
assert.ok(edge, 'Atur BROWSER_PATH ke executable Chrome atau Edge.');
const built = await build({
  configFile: false,
  logLevel: 'error',
  define: { 'import.meta.env.VITE_GAS_URL': JSON.stringify('https://script.google.com/macros/s/isolated-test/exec') },
  build: { write: false, minify: false, cssCodeSplit: false,
    rollupOptions: { input: fileURLToPath(new URL('../src/main.jsx', import.meta.url)),
      output: { format: 'iife', inlineDynamicImports: true } } },
});
const bundle = built.output.find(file => file.type === 'chunk').code;
const setup = String.raw`
window.__check = { requests: [], errors: [], steps: [] };
addEventListener('error', event => __check.errors.push(String(event.error?.stack || event.message)));
addEventListener('unhandledrejection', event => __check.errors.push(String(event.reason?.stack || event.reason)));
// Halaman file:// tidak punya origin HTTP. Basis ini hanya untuk pratinjau QR.
const NativeURL = URL;
window.URL = class extends NativeURL {
  constructor(value, base) { super(value, base === 'null' ? 'https://example.test' : base); }
};
const tickets = Array.from({ length: 8 }, (_, index) => ({
  registrationNumber: String(index + 1).padStart(3, '0'),
  checkToken: '2027' + String(index + 1).padStart(3, '0'),
  token: String(index + 1).padStart(64, '0'), eligible: index === 0, checkedAt: '',
}));
let nextFailure = '';
HTMLFormElement.prototype.submit = function () {
  const values = Object.fromEntries([...this.elements].map(input => [input.name, input.value]));
  const payload = JSON.parse(values.payload);
  __check.requests.push(payload.action);
  const data = { status: 'LIVE', title: 'Isolated refresh test', total: 8, maxParticipants: 8,
    checked: tickets.filter(ticket => ticket.checkedAt).length, selected: 1, lockedAt: '',
    tickets: tickets.map(ticket => ({ ...ticket })) };
  const failure = payload.action === 'adminStats' ? nextFailure : '';
  if (payload.action === 'adminStats') nextFailure = '';
  setTimeout(() => dispatchEvent(new MessageEvent('message', {
    origin: 'https://script.googleusercontent.com',
    data: { type: 'NBSA_PRIZEPOOL_RESULT', requestId: values.requestId,
      ok: !failure, ...(failure ? { error: failure } : { data }) },
  })), 2500);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (predicate, message) => {
  for (let i = 0; i < 600; i++) { if (predicate()) return; await delay(25); }
  throw new Error(message);
};
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const checkedRows = () => [...document.querySelectorAll('tbody tr')].filter(row => row.textContent.includes('Sudah diperiksa')).length;
const mark = index => { tickets[index].checkedAt = '2026-11-19T10:00:00.000Z'; };
async function check() {
  await wait(() => document.querySelector('#admin-password'), 'login missing');
  const input = document.querySelector('#admin-password');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'isolated-test-password');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(50);
  input.form.requestSubmit();
  await wait(() => document.querySelectorAll('tbody tr').length === 8, 'login did not load tickets');
  __check.steps.push('login');
  const studio = document.querySelector('#studio-title').closest('details');
  const session = document.querySelector('#flow-title').closest('details');
  if (!studio?.open || !session?.open) throw new Error('panels must start expanded');
  const company = document.querySelector('#company-name');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(company, 'Isolated panel test');
  company.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(50);
  studio.querySelector('summary').click();
  if (studio.open || !session.open) throw new Error('studio collapse must not close session');
  session.querySelector('summary').click();
  if (session.open) throw new Error('session did not collapse');
  mark(0);
  await wait(() => checkedRows() === 1, 'automatic refresh did not update first checked row');
  if (studio.open || session.open) throw new Error('polling reopened collapsed panels');
  studio.querySelector('summary').click();
  if (!studio.open || session.open || company.value !== 'Isolated panel test') throw new Error('panel state or input lost');
  session.querySelector('summary').click();
  if (!session.open) throw new Error('session did not reopen');
  __check.steps.push('independent native panels preserve input and collapsed state during polling');
  __check.steps.push('automatic refresh');
  mark(1);
  button('Segarkan data').click();
  await wait(() => checkedRows() === 2, 'manual refresh did not update second checked row');
  __check.steps.push('manual refresh');
  await wait(() => button('Jeda pembaruan otomatis')?.disabled === false, 'manual refresh did not finish');
  button('Jeda pembaruan otomatis').click();
  await wait(() => button('Aktifkan pembaruan otomatis'), 'pause button did not toggle');
  const pausedRequests = __check.requests.filter(action => action === 'adminStats').length;
  mark(2);
  await delay(5500);
  if (checkedRows() !== 2 || pausedRequests !== __check.requests.filter(action => action === 'adminStats').length) throw new Error('pause did not stop polling');
  button('Segarkan data').click();
  await wait(() => checkedRows() === 3, 'manual refresh failed while automatic refresh paused');
  __check.steps.push('manual refresh while paused');
  await wait(() => button('Segarkan data')?.disabled === false, 'manual refresh still busy');
  mark(3);
  nextFailure = 'Isolated connection failure';
  button('Segarkan data').click();
  await wait(() => document.body.textContent.includes('Isolated connection failure'), 'request error missing');
  if (checkedRows() !== 3) throw new Error('failed request lost previous data');
  await wait(() => button('Segarkan data')?.disabled === false, 'failed request still busy');
  button('Segarkan data').click();
  await wait(() => checkedRows() === 4, 'manual refresh did not recover after error');
  __check.steps.push('error preserves data and manual refresh recovers');
  await wait(() => button('Aktifkan pembaruan otomatis')?.disabled === false, 'refresh still busy');
  mark(4);
  button('Aktifkan pembaruan otomatis').click();
  await wait(() => checkedRows() === 5, 'automatic refresh did not resume');
  __check.steps.push('automatic refresh resumes');
  const lastSync = document.querySelector('time');
  if (!lastSync?.dateTime) throw new Error('last successful refresh time missing');
  const previousTime = lastSync.dateTime;
  nextFailure = 'Domain website belum diizinkan. Isolated automatic failure';
  await wait(() => document.body.textContent.includes('Pembaruan otomatis gagal: Domain website belum diizinkan.'), 'automatic refresh hides server error');
  if (document.querySelector('time').dateTime !== previousTime) throw new Error('failed refresh advanced successful timestamp');
  if (checkedRows() !== 5) throw new Error('automatic failure lost checked rows');
  __check.steps.push('automatic failure shows actual error and retains last successful time');
  __check.ok = true;
}
addEventListener('DOMContentLoaded', () => {
  check().catch(error => { __check.failure = String(error.stack || error); }).finally(() => {
    const output = document.createElement('pre'); output.id = 'test-result';
    output.textContent = JSON.stringify(__check); document.body.append(output);
  });
});
`;
const temporary = mkdtempSync(join(tmpdir(), 'prizepool-refresh-'));
try {
  const page = join(temporary, 'index.html');
  writeFileSync(page, '<!doctype html><meta charset="utf-8"><title>Isolated refresh test</title><div id="root"></div><script>' +
    setup.replaceAll('</script', '<\\/script') + '</script><script>' + bundle.replaceAll('</script', '<\\/script') + '</script>');
  const output = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--metrics-recording-only', `--user-data-dir=${join(temporary, 'profile')}`,
    '--virtual-time-budget=65000', '--dump-dom', pathToFileURL(page).href + '?admin=1'],
    { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const resultText = output.match(/<pre id="test-result">([^<]*)<\/pre>/)?.[1];
  assert.ok(resultText, 'Browser did not finish check. Page tail: ' + output.slice(-4000));
  const result = JSON.parse(resultText.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&'));
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true, result.failure);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
