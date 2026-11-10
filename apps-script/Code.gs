/**
 * NBSA Prize Pool 2027 — backend Google Sheets.
 * H-1: cetak 65 QR; hari H: bagikan; EO tentukan TRUE/FALSE lewat CSV;
 * saat Prize Pool: scan QR dan masukkan 2027 + nomor 3 digit.
 * Data EO tidak pernah dimuat di frontend publik. Satu spreadsheet per acara.
 */
const PP = Object.freeze({
  COUNT: 65,
  WINNERS: 8,
  YEAR: '2027',
  TICKETS: 'Participants', // sengaja memakai nama tab lama supaya migrasi lebih aman
  SETTINGS: 'Settings',
  AUDIT: 'Audit',
  HEADERS: ['nomor_registrasi', 'token_pengecekan', 'qr_token', 'terpilih', 'waktu_scan_pertama'],
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎁 Prize Pool')
    .addItem('1. Inisialisasi Database', 'setupProject')
    .addItem('2. Atur Password Admin', 'promptAdminPassword')
    .addItem('3. Atur Domain Website', 'promptSiteOrigins')
    .addItem('4. Atur Nama Acara', 'promptEventTitle')
    .addToUi();
}

function setupProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Extensions > Apps Script pada Google Spreadsheet.');
  const tickets = getOrCreateSheet_(ss, PP.TICKETS);
  const settings = getOrCreateSheet_(ss, PP.SETTINGS);
  const audit = getOrCreateSheet_(ss, PP.AUDIT);
  if (tickets.getLastRow() > 1) {
    const head = tickets.getRange(1, 1, 1, PP.HEADERS.length).getValues()[0];
    if (head.join('|') !== PP.HEADERS.join('|')) {
      throw new Error('Sheet sudah berisi data dari versi lama. Buat Spreadsheet baru agar 65 QR lama tidak tertimpa.');
    }
  }
  // Jika spreadsheet sudah pernah di-setup tapi belum ada peserta, header lama aman diganti.
  tickets.getRange(1, 1, 1, PP.HEADERS.length).setValues([PP.HEADERS]);
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 4, 2).setValues([
      ['key', 'value'], ['STATUS', 'DRAFT'],
      ['EVENT_TITLE', 'NBSA Prize Pool 2027'], ['LOCKED_AT', ''],
    ]);
  }
  if (audit.getLastRow() === 0) audit.appendRow(['waktu', 'aksi', 'nomor_registrasi', 'keterangan']);
  tickets.setFrozenRows(1); settings.setFrozenRows(1); audit.setFrozenRows(1);
  tickets.getRange('A:C').setNumberFormat('@');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ss.toast('Database Prize Pool 2027 siap. Atur password dan domain dari menu 🎁 Prize Pool.');
}

function promptAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Password admin', 'Minimal 12 karakter. Jangan pakai password akun Google.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pass = res.getResponseText();
  if (pass.length < 12) { ui.alert('Password minimal 12 karakter.'); return; }
  const salt = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ ADMIN_SALT: salt, ADMIN_HASH: hashText_(salt + '|' + pass) });
  ui.alert('Password admin tersimpan di Script Properties.');
}

function promptSiteOrigins() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Domain website yang diizinkan',
    'Masukkan origin tanpa /prizepool/, misalnya https://faservid.github.io', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const origins = res.getResponseText().split(',').map(x => x.trim()).filter(Boolean);
  if (!origins.length || origins.some(x => !/^https:\/\/[-a-zA-Z0-9.]+(?::\d+)?$/.test(x) && !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(x))) {
    ui.alert('Origin tidak valid. Contoh: https://faservid.github.io'); return;
  }
  PropertiesService.getScriptProperties().setProperty('ALLOWED_ORIGINS', origins.join(','));
  ui.alert('Origin disimpan: ' + origins.join(', '));
}

function promptEventTitle() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Nama acara', 'Contoh: NBSA Prize Pool 2027', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const title = res.getResponseText().trim();
  if (title) setSetting_('EVENT_TITLE', title.slice(0, 100));
}

function doGet() {
  return HtmlService.createHtmlOutput('<p>NBSA Prize Pool 2027 API aktif. Gunakan aplikasi React.</p>');
}

function doPost(e) {
  const reqId = String(e && e.parameter && e.parameter.requestId || '').slice(0, 100);
  const origin = String(e && e.parameter && e.parameter.origin || '');
  const allowedOrigins = String(PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS') || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  if (!allowedOrigins.includes(origin)) {
    return HtmlService.createHtmlOutput('<p>Domain tidak diizinkan. Periksa pengaturan origin di Google Sheets.</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  let envelope;
  try {
    const raw = String(e.parameter.payload || '');
    if (raw.length > 80000) throw new Error('Payload terlalu besar.');
    const payload = JSON.parse(raw);
    const data = dispatch_(payload);
    envelope = { type: 'NBSA_PRIZEPOOL_RESULT', requestId: reqId, ok: true, data };
  } catch (err) {
    envelope = { type: 'NBSA_PRIZEPOOL_RESULT', requestId: reqId, ok: false,
      error: String(err && err.message || 'Terjadi kesalahan server.').slice(0, 250) };
  }
  const safeJson = JSON.stringify(envelope).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const html = '<!doctype html><html><body><script>' +
    'window.top.postMessage(' + safeJson + ',' + JSON.stringify(origin) + ');' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function dispatch_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Permintaan tidak valid.');
  const action = String(p.action || '');
  if (action === 'publicInfo') return publicInfo_();
  if (action === 'verify') return verifyTicket_(p);
  assertAdmin_(p.password);
  if (action === 'adminStats') return adminStats_();
  if (action === 'adminGenerateTickets') return withLock_(() => generateTickets_());
  if (action === 'adminImportResults') return withLock_(() => importResults_(p.results));
  if (action === 'adminGoLive') return withLock_(() => changeStatus_('LOCKED', 'LIVE'));
  if (action === 'adminClose') return withLock_(() => changeStatus_('LIVE', 'CLOSED'));
  throw new Error('Aksi tidak dikenal.');
}

function publicInfo_() {
  const rows = getTicketRows_();
  return {
    title: getSetting_('EVENT_TITLE') || 'NBSA Prize Pool 2027',
    status: getSetting_('STATUS') || 'DRAFT',
    total: rows.length,
    maxParticipants: PP.COUNT,
    maxWinners: PP.WINNERS,
    checked: rows.filter(r => !!r[4]).length,
  };
}

function verifyTicket_(p) {
  const checkToken = String(p.checkToken || '').trim();
  const qrToken = String(p.token || '').trim().toLowerCase();
  if (!/^2027\d{3}$/.test(checkToken) || !/^[a-f0-9]{64}$/.test(qrToken)) {
    throw new Error('Token pengecekan atau QR Code tidak valid.');
  }
  return withLock_(() => {
    if (getSetting_('STATUS') !== 'LIVE') throw new Error('Sesi pengecekan Prize Pool belum dibuka atau sudah ditutup.');
    const rows = getTicketRows_();
    const idx = rows.findIndex(r => String(r[1]) === checkToken && String(r[2]) === qrToken);
    if (idx < 0) {
      appendAudit_('INVALID_CHECK', '', 'Token cek dan QR tidak cocok');
      throw new Error('Token tidak cocok dengan nomor tiket pada QR yang dipindai.');
    }
    const row = rows[idx];
    const alreadyChecked = !!row[4];
    if (!alreadyChecked) {
      getSs_().getSheetByName(PP.TICKETS).getRange(idx + 2, 5).setValue(new Date());
      appendAudit_('FIRST_CHECK', String(row[0]), 'Hasil ditampilkan; status=' + (row[3] === true));
    }
    return {
      registrationNumber: String(row[0]),
      checkToken: String(row[1]),
      eligible: row[3] === true,
      alreadyChecked,
    };
  });
}

function adminStats_() {
  const rows = getTicketRows_();
  return {
    ...publicInfo_(),
    lockedAt: getSetting_('LOCKED_AT') || '',
    selected: rows.filter(r => r[3] === true).length,
    tickets: rows.map(row => ({
      registrationNumber: String(row[0]), checkToken: String(row[1]),
      token: String(row[2]), eligible: row[3] === true,
      checkedAt: row[4] instanceof Date ? row[4].toISOString() : String(row[4] || ''),
    })),
  };
}

function generateTickets_() {
  if (getSetting_('STATUS') !== 'DRAFT') throw new Error('Tiket hanya bisa dibuat saat DRAFT.');
  if (getTicketRows_().length) throw new Error('65 tiket sudah dibuat. Tidak dapat membuat ulang karena QR sudah dibagikan.');
  const rows = [];
  const seen = new Set();
  for (let i = 1; i <= PP.COUNT; i++) {
    const num = ('000' + i).slice(-3);
    let token;
    do { token = randomToken_(); } while (seen.has(token));
    seen.add(token);
    rows.push([num, PP.YEAR + num, token, false, '']);
  }
  getSs_().getSheetByName(PP.TICKETS).getRange(2, 1, PP.COUNT, PP.HEADERS.length).setValues(rows);
  setSetting_('STATUS', 'TICKETS_READY');
  appendAudit_('GENERATE_TICKETS', '', '65 tiket QR unik dibuat tanpa penentuan hasil');
  return adminStats_();
}

function importResults_(items) {
  if (getSetting_('STATUS') !== 'TICKETS_READY') throw new Error('Hasil hanya dapat diimpor satu kali setelah QR dibuat dan sebelum sesi LIVE.');
  const rows = getTicketRows_();
  if (rows.length !== PP.COUNT) throw new Error('Database wajib berisi tepat 65 tiket.');
  if (!Array.isArray(items) || items.length !== PP.COUNT) throw new Error('File EO harus memiliki tepat 65 baris data.');
  if (rows.some(row => !/^[a-f0-9]{64}$/.test(String(row[2])) || !!row[4])) {
    throw new Error('Data tiket tidak valid atau sudah ada hasil scan.');
  }
  const byNumber = new Map(rows.map(row => [String(row[0]), row]));
  const selectedByNumber = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new Error('Baris CSV tidak valid.');
    const number = String(item.registrationNumber || '').trim();
    const checkToken = String(item.checkToken || '').trim();
    if (!/^\d{3}$/.test(number) || !byNumber.has(number)) throw new Error('Nomor registrasi tidak valid: ' + number);
    if (selectedByNumber.has(number)) throw new Error('Nomor registrasi duplikat: ' + number);
    if (checkToken !== PP.YEAR + number || String(byNumber.get(number)[1]) !== checkToken) {
      throw new Error('Token tidak cocok untuk nomor ' + number);
    }
    if (typeof item.selected !== 'boolean') throw new Error('Kolom terpilih untuk nomor ' + number + ' wajib TRUE/FALSE.');
    selectedByNumber.set(number, item.selected);
  }
  if (selectedByNumber.size !== PP.COUNT) throw new Error('Nomor 001 hingga 065 wajib lengkap.');
  const selectedCount = Array.from(selectedByNumber.values()).filter(Boolean).length;
  if (selectedCount !== PP.WINNERS) throw new Error('EO wajib memilih tepat 8 TRUE dan 57 FALSE. Saat ini ' + selectedCount + ' TRUE.');
  // Seluruh validasi dilakukan sebelum perubahan state. Tidak ada undian otomatis.
  setSetting_('STATUS', 'IMPORTING');
  const flags = rows.map(row => [selectedByNumber.get(String(row[0]))]);
  getSs_().getSheetByName(PP.TICKETS).getRange(2, 4, PP.COUNT, 1).setValues(flags);
  setSetting_('LOCKED_AT', new Date().toISOString());
  setSetting_('STATUS', 'LOCKED');
  appendAudit_('IMPORT_EO_LOCKED', '', '65 status diimpor dari EO: 8 TRUE, 57 FALSE');
  return adminStats_();
}

function changeStatus_(expected, next) {
  if (getSetting_('STATUS') !== expected) throw new Error('Status harus ' + expected + ' untuk melanjutkan.');
  const rows = getTicketRows_();
  if (rows.length !== PP.COUNT || rows.filter(r => r[3] === true).length !== PP.WINNERS) {
    throw new Error('Validasi 65 tiket dan 8 TRUE gagal.');
  }
  setSetting_('STATUS', next);
  appendAudit_('STATUS', '', expected + ' → ' + next);
  return adminStats_();
}

function assertAdmin_(password) {
  const p = PropertiesService.getScriptProperties();
  const salt = p.getProperty('ADMIN_SALT');
  const expected = p.getProperty('ADMIN_HASH');
  if (!salt || !expected) throw new Error('Password admin belum diatur melalui menu Prize Pool di Google Sheets.');
  const pass = String(password || '');
  if (pass.length > 200) throw new Error('Password tidak valid.');
  const actual = hashText_(salt + '|' + pass);
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  if (diff !== 0) throw new Error('Password admin salah.');
}
function hashText_(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(digest);
}
function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function getSs_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Belum inisialisasi. Jalankan setupProject dari editor Apps Script.');
  return SpreadsheetApp.openById(id);
}
function getOrCreateSheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function getTicketRows_() {
  const sh = getSs_().getSheetByName(PP.TICKETS);
  if (!sh) throw new Error('Sheet Participants belum dibuat.');
  const last = sh.getLastRow();
  return last <= 1 ? [] : sh.getRange(2, 1, last - 1, PP.HEADERS.length).getValues().filter(r => String(r[0]).trim());
}
function getSetting_(key) {
  const sh = getSs_().getSheetByName(PP.SETTINGS);
  if (!sh || sh.getLastRow() <= 1) return '';
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const item = rows.find(r => String(r[0]) === key);
  return item ? String(item[1]) : '';
}
function setSetting_(key, value) {
  const sh = getSs_().getSheetByName(PP.SETTINGS);
  if (sh.getLastRow() > 1) {
    const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const index = keys.findIndex(r => String(r[0]) === key);
    if (index >= 0) { sh.getRange(index + 2, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}
function appendAudit_(action, number, note) {
  getSs_().getSheetByName(PP.AUDIT).appendRow([new Date(), action, number, note]);
}
