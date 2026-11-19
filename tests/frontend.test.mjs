import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import {
  STATUS_NAMES, buildEoCsv, parseEoCsv, parseEoRows, parseEoFile, normalizeRegistrationNumber, validateTicketCount, validateTicketSet,
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
  assert.equal(parseEoCsv(empty, count).filter(row => row.selected).length, 0);
  for (const selected of [1, 3, 7, 8, count]) {
    const dynamic = empty.trim().split('\r\n').map((row, i) => i > 0 && i <= selected ? row.replace(/FALSE$/, 'true') : row).join('\r\n');
    assert.equal(parseEoCsv(dynamic, count).filter(row => row.selected).length, selected);
  }
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
  if (count > 8) assert.equal(parseEoCsv(valid.replace('009,2027009,FALSE', '009,2027009,TRUE'), count).filter(row => row.selected).length, 9);
}
assert.throws(() => parseEoCsv(''), /kosong/);
assert.throws(() => parseEoCsv('nomor,token,hasil\n001,2027001,TRUE'), /Header wajib/);
assert.throws(() => parseEoCsv('"nomor_registrasi'), /kutip belum ditutup/);

const header = ['nomor_registrasi', 'token_pengecekan', 'terpilih'];
const excelRows = [header, ...Array.from({ length: 65 }, (_, i) => [i + 1, `2027${String(i + 1).padStart(3, '0')}`, i < 3])];
assert.equal(parseEoRows(excelRows).filter(row => row.selected).length, 3);
for (const bad of [null, '', 0, 1, 'yes', 'TRUEE']) {
  assert.throws(() => parseEoRows([header, ...excelRows.slice(1).map((row, i) => i ? row : [row[0], row[1], bad])]), /TRUE atau FALSE/);
}
const xml = new TextEncoder();
function xlsxFixture(rows, sheetName = 'EO_Import') {
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((row, i) => `<row r="${i + 1}">` + row.map((value, j) => {
      const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
      if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${Number(value)}</v></c>`;
      if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
    }).join('') + '</row>').join('') + '</sheetData></worksheet>',
  };
  return new File([zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, xml.encode(content)])))], 'hasil.xlsx');
}
for (const selected of [0, 1, 3, 9, 65]) {
  const rows = [header, ...excelRows.slice(1).map((row, i) => [row[0], row[1], i < selected])];
  assert.equal((await parseEoFile(xlsxFixture(rows))).filter(row => row.selected).length, selected);
}
const template = readFileSync(new URL('../public/Template_EO_PrizePool_2027.xlsx', import.meta.url));
assert.equal((await parseEoFile(new File([template], 'template.xlsx'))).filter(row => row.selected).length, 0);
assert.deepEqual(template, readFileSync(new URL('../examples/Template_EO_PrizePool_2027.xlsx', import.meta.url)));
const archive = unzipSync(template);
const guide = new TextDecoder().decode(archive['xl/worksheets/sheet2.xml']);
assert.doesNotMatch(guide, /B5=8|57 FALSE|tepat 8/);
assert.match(guide, /EO_Import/);
const sheet = new TextDecoder().decode(archive['xl/worksheets/sheet1.xml']);
archive['xl/worksheets/sheet1.xml'] = xml.encode(sheet.replace(/(<x:c\b[^>]*\br="C[234]"[^>]*><x:v>)FALSE(<\/x:v>)/g, '$1true$2'));
assert.equal((await parseEoFile(new File([zipSync(archive)], 'hasil-edit.xlsx'))).filter(row => row.selected).length, 3);
await assert.rejects(parseEoFile(xlsxFixture(excelRows), 100), /100 data/);
await assert.rejects(parseEoFile(xlsxFixture(excelRows, 'PANDUAN')), /Tab EO_Import tidak ditemukan/);
await assert.rejects(parseEoFile(new File(['broken'], 'hasil.xlsx')), /Excel tidak dapat dibaca/);
await assert.rejects(parseEoFile(new File(['broken'], 'hasil.xls')), /CSV atau Excel/);
await assert.rejects(parseEoFile(new File([], 'hasil.csv')), /1 byte sampai 2 MB/);
await assert.rejects(parseEoFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'hasil.xlsx')), /2 MB/);
const csvFile = new File([header.join(',') + '\n' + excelRows.slice(1).map(row => row.join(',')).join('\n')], 'hasil.csv');
assert.equal((await parseEoFile(csvFile)).filter(row => row.selected).length, 3);

// Pemeriksaan source saja, bukan verifikasi tampilan di browser.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /<html[^>]*data-theme="light"/);
assert.match(css, /color-scheme:\s*light\s*;/);
assert.doesNotMatch(app + css, /nb_theme|ThemeToggle|prefers-color-scheme|data-theme\s*=\s*["']dark/);
assert.doesNotMatch(app + Object.values(STATUS_NAMES).join('\n'), /(?:hasil(?: pilihan)?|terpilih|CSV) EO\b|Yahh|berhak menerima Hidden Prize/i);
assert.match(app, /berhak mengikuti Hidden Prize NBSA/);
assert.doesNotMatch(app, /2027052|tepat 8|8 tiket terpilih|\/ 8<\/span>/);
assert.match(app, /rows\.filter\(row => row\.selected\)\.length/);
assert.match(app, /Tidak ada tiket terpilih\. Pastikan berkas/);
assert.equal(STATUS_NAMES.RESETTING, 'Reset sesi belum selesai');
assert.match(app, /if \(!window\.confirm\(question\)\) return;/);
assert.match(app, /disabled=\{sessionDisabled\} aria-describedby="reset-session-help" onClick=\{\(\) => execute\('adminResetSession'/);
assert.match(app, /dihapus dan tidak dapat dipulihkan melalui aplikasi/);
assert.match(app, /Nomor, token, jumlah tiket, dan QR tetap sama/);
assert.match(app, /Anda harus mengimpor hasil baru sebelum membuka sesi kembali/);
assert.match(app, /if \(!password \|\| !isConfigured \|\| sessionDisabled \|\| !autoRefresh\) return;/);
assert.match(app, /const stop = pollAdminStats\(password, response => \{\s*setData\(response\);\s*setSyncError\(''\);/);
assert.match(app, /const send = useCallback\(async[^\n]*\n\s*stopPollingRef\.current\?\.\(\);/);
assert.match(app, /aria-pressed=\{autoRefresh\}/);
assert.match(app, /Jeda pembaruan otomatis/);
assert.match(app, /<Notice type="error">\{syncError\}<\/Notice>/);
assert.match(app, /Pembaruan otomatis gagal: \$\{err\.message/);
assert.match(app, /Data terakhir diterima: <time dateTime=\{lastSyncedAt\.toISOString\(\)\}/);
assert.equal((app.match(/setLastSyncedAt\(new Date\(\)\)/g) || []).length, 2);
console.log('PASS frontend: konfigurasi tiket/terpilih dinamis, CSV/XLSX, boolean Excel, validasi tiket, source light-only, reset terkonfirmasi, integrasi polling admin dan tombol jeda.');
