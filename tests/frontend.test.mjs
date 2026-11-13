import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STATUS_NAMES, buildEoCsv, parseEoCsv, normalizeRegistrationNumber, validateTicketCount, validateTicketSet,
} from '../src/utils.js';

for (const value of [8, 65, 100, 999, '8', '100', ' 999 ']) {
  assert.equal(validateTicketCount(value), Number(value));
}
for (const value of [undefined, null, true, false, '', ' ', 7, 1000, 8.5, NaN, Infinity, '8.5', '1e2', '100abc', [], {}]) {
  assert.throws(() => validateTicketCount(value), /bilangan bulat 8–999/);
}
assert.equal(normalizeRegistrationNumber('52'), '052');
assert.equal(normalizeRegistrationNumber('001'), '001');
assert.equal(normalizeRegistrationNumber('999'), '999');
assert.throws(() => normalizeRegistrationNumber('066', 65), /001–065/);
for (const value of ['0', '1000', 'abc']) assert.throws(() => normalizeRegistrationNumber(value));

for (const count of [8, 65, 100, 999]) {
  const tickets = Array.from({ length: count }, (_, i) => {
    const registrationNumber = String(i + 1).padStart(3, '0');
    return { registrationNumber, checkToken: `2027${registrationNumber}` };
  });
  assert.equal(validateTicketSet(tickets, count), count);
  const empty = buildEoCsv([...tickets].reverse(), count);
  assert.equal(empty.trim().split('\r\n').length, count + 1);
  assert.ok(empty.includes('001,2027001,FALSE'));
  assert.throws(() => parseEoCsv(empty, count), /8 TRUE/);
  const rows = empty.split('\r\n');
  for (let i = 1; i <= 8; i++) rows[i] = rows[i].replace(/FALSE$/, 'TRUE');
  const valid = rows.join('\r\n');
  const results = parseEoCsv(valid, count);
  assert.equal(results.length, count);
  assert.equal(results.filter(row => row.selected).length, 8);
  assert.equal(results[0].registrationNumber, '001');
  assert.equal(results.at(-1).registrationNumber, String(count).padStart(3, '0'));
  assert.throws(() => parseEoCsv(valid.replace('2027001', '2027999'), count), /token harus/);
  assert.throws(() => parseEoCsv(valid.replace('002,2027002', '001,2027001'), count), /duplikat/);
  assert.throws(() => parseEoCsv(valid.replace('TRUE', 'YEAH'), count), /TRUE atau FALSE/);
  assert.throws(() => parseEoCsv(valid.replace('008,2027008,TRUE\r\n', ''), count), new RegExp(`${count} data`));
  assert.throws(() => buildEoCsv(tickets.slice(0, -1), count), new RegExp(`tepat ${count} tiket`));
  assert.throws(() => validateTicketSet([...tickets.slice(0, -1), tickets[0]], count), /duplikat/);
  assert.throws(() => buildEoCsv(tickets.map((row, i) => i ? row : { ...row, checkToken: '2027999' }), count), /token pengecekan/);
  const semicolon = rows.filter(Boolean).map(row => row.split(',').map(cell => `"${cell}"`).join(';')).join('\n');
  assert.equal(parseEoCsv(semicolon, count).length, count);
  if (count === 65) assert.equal(parseEoCsv(valid).length, 65); // Kompatibilitas default acara lama.
  if (count < 999) {
    const outOfRange = String(count + 1).padStart(3, '0');
    assert.throws(() => parseEoCsv(valid.replace('001,2027001', `${outOfRange},2027${outOfRange}`), count), /Nomor registrasi harus/);
    assert.throws(() => validateTicketSet([...tickets.slice(0, -1), { registrationNumber: outOfRange, checkToken: `2027${outOfRange}` }], count), /di luar rentang/);
  }
  if (count > 8) assert.throws(() => parseEoCsv(valid.replace('009,2027009,FALSE', '009,2027009,TRUE'), count), /8 TRUE/);
}
assert.throws(() => parseEoCsv(''), /CSV kosong/);
assert.throws(() => parseEoCsv('nomor,token,hasil\n001,2027001,TRUE'), /Header wajib/);
assert.throws(() => parseEoCsv('"nomor_registrasi'), /kutip belum ditutup/);

// Pemeriksaan source saja, bukan verifikasi tampilan di browser.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /<html[^>]*data-theme="light"/);
assert.match(css, /color-scheme:\s*light\s*;/);
assert.doesNotMatch(app + css, /nb_theme|ThemeToggle|prefers-color-scheme|data-theme\s*=\s*["']dark/);
assert.doesNotMatch(app + Object.values(STATUS_NAMES).join('\n'), /(?:hasil(?: pilihan)?|terpilih|CSV) EO\b|Yahh|berhak menerima Hidden Prize/i);
assert.match(app, /berhak mengikuti Hidden Prize NBSA/);
console.log('PASS frontend: konfigurasi 8/65/100/999, CSV lengkap dengan 8 TRUE, validasi pasangan dan jumlah, default 65, source light-only, bahasa status keikutsertaan.');
