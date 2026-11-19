const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const io = { reads: [], events: [], failScanWrite: false, failAudit: false, failFlush: false,
  failResetWrite: false, failResetAudit: false, afterRead: null, afterCachePut: null };
const lock = { held: false, busy: false, beforeTry: null, waits: [] };
const cache = new Map();
let cacheClock = 0;
let cacheBroken = false;
class Sheet {
  constructor(name){this.name=name;this.rows=[];}
  getLastRow(){return this.rows.length;}
  appendRow(row){
    if (row[1] === 'FIRST_CHECK') {
      assert.ok(lock.held, 'First-scan audit stays inside lock');
      if (io.failAudit) { io.failAudit = false; throw new Error('Audit write failed'); }
    }
    if (row[1] === 'RESET_SESSION' && io.failResetAudit) {
      io.failResetAudit = false; throw new Error('Reset audit failed');
    }
    this.rows.push([...row]);
  }
  getRange(r,c,n=1,m=1){
    // Whole-column range A:C used only for number formatting.
    if(typeof r==='string')return {setNumberFormat:()=>{}};
    const read = () => io.reads.push({ sheet: this.name, r, c, n, m, locked: lock.held });
    return {
      getValues:()=>{
        read();
        const values = Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.rows[r-1+i]?.[c-1+j]??''));
        const after = io.afterRead; io.afterRead = null; after?.(this.name);
        return values;
      },
      getValue:()=>{read();return this.rows[r-1]?.[c-1]??'';},
      setValues:values=>{
        if (this.name === 'Participants' && c === 4 && m === 2) {
          assert.ok(lock.held, 'Session reset stays inside admin lock');
          if (io.failResetWrite) { io.failResetWrite = false; throw new Error('Reset write failed'); }
        }
        for(let i=0;i<n;i++){if(!this.rows[r-1+i])this.rows[r-1+i]=[];for(let j=0;j<m;j++)this.rows[r-1+i][c-1+j]=values[i][j];}
      },
      setValue:value=>{
        if (this.name === 'Participants' && c === 5) {
          assert.ok(lock.held, 'First timestamp must be protected by lock');
          if (io.failScanWrite) { io.failScanWrite = false; throw new Error('Scan write failed'); }
          io.events.push('scan:' + r);
        }
        if(!this.rows[r-1])this.rows[r-1]=[];this.rows[r-1][c-1]=value;
      },
    };
  }
  setFrozenRows(){}
}
const tabs=new Map();
const ss={getId:()=> 'SHEET_TEST',getSheetByName:n=>tabs.get(n),insertSheet:n=>{let s=new Sheet(n);tabs.set(n,s);return s;},toast:()=>{}};
const props=new Map();
const propsApi={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),setProperties:obj=>Object.entries(obj).forEach(([k,v])=>props.set(k,v))};
const ctx=vm.createContext({
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{assert.equal(id,'SHEET_TEST');return ss;},flush:()=>{
    assert.ok(lock.held, 'Flush must finish before lock release');
    io.events.push('flush');
    if (io.failFlush) { io.failFlush = false; throw new Error('Flush failed'); }
  }},
  PropertiesService:{getScriptProperties:()=>propsApi},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],base64Encode:v=>Buffer.from(v.map(b=>b<0?b+256:b)).toString('base64'),base64EncodeWebSafe:v=>Buffer.from(v.map(b=>b<0?b+256:b)).toString('base64url'),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'}},
  CacheService:{getScriptCache:()=>{
    if (cacheBroken) throw new Error('Cache unavailable');
    return {
      get:key=>{const entry=cache.get(key);return entry && entry.expires>cacheClock ? entry.value : null;},
      put:(key,value,seconds)=>{
        assert.ok(key.length <= 250);
        assert.ok(Buffer.byteLength(value, 'utf8') <= 100 * 1024);
        assert.ok(seconds >= 1 && seconds <= 21600);
        cache.set(key,{value,expires:cacheClock+seconds*1000});
        const after = io.afterCachePut;
        if (after && !lock.held) { io.afterCachePut = null; after(key, value); }
      },
      remove:key=>cache.delete(key),
    };
  }},
  LockService:{getScriptLock:()=>({
    waitLock:ms=>{lock.waits.push(ms);assert.equal(lock.held,false);lock.held=true;},
    tryLock:ms=>{
      lock.waits.push(ms);
      const before = lock.beforeTry; lock.beforeTry = null; before?.();
      if (lock.busy || lock.held) return false;
      lock.held = true; return true;
    },
    releaseLock:()=>{assert.ok(lock.held);io.events.push('release');lock.held=false;},
  })},
  HtmlService:{createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}}),XFrameOptionsMode:{ALLOWALL:1}},
  Date,Math,String,Set,Map,JSON,Array,Error,Object,console,
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),ctx);
function run(js){return vm.runInContext(js,ctx);}
const shortToken = token => Buffer.from(token.slice(20,32) + token.slice(52,64), 'hex').toString('base64url');
ctx.compactFixture = '0'.repeat(20) + 'fbffef001122' + '0'.repeat(20) + '334455667788';
assert.equal(run('compactQrToken_(compactFixture)'), '-__vABEiM0RVZneI');
assert.equal(run('compactQrToken_(compactFixture.toUpperCase())'), '-__vABEiM0RVZneI');
assert.throws(() => run('compactQrToken_("a".repeat(16))'), /QR rahasia/);
run('setupProject()');
assert.equal(tabs.size,3);
assert.equal(run('getSetting_("STATUS")'),'DRAFT');
// setup is repeatable before generate
run('setupProject()');
props.set('ADMIN_SALT','SALT');
props.set('ADMIN_HASH',run('hashText_("SALT|testing-password-very-long")'));
props.set('ALLOWED_ORIGINS','https://faservid.github.io');
const snapshot = () => JSON.stringify([...tabs].map(([name, sheet]) => [name, sheet.rows]));
assert.equal(run('publicInfo_().maxParticipants'), 65);
assert.equal(run('getSetting_("TICKET_COUNT")'), '');
for (const ticketCount of [null, true, false, '', ' ', 7, 1000, 8.5, NaN, Infinity, '8.5', '1e2', '100abc', [], {}]) {
  ctx.payload = { action: 'adminGenerateTickets', password: 'testing-password-very-long', ticketCount };
  const before = snapshot();
  assert.throws(() => run('dispatch_(payload)'), /bilangan bulat 8–999/);
  assert.equal(snapshot(), before, 'Invalid count must not change settings, tickets or audit');
}
const initial=run('generateTickets_()');
assert.equal(initial.status,'TICKETS_READY');
assert.equal(initial.total,65);
assert.equal(initial.maxParticipants,65);
assert.equal(run('getSetting_("TICKET_COUNT")'), '65');
// Acara lama tanpa key TICKET_COUNT tetap dapat memakai seluruh lifecycle 65 tiket.
tabs.get('Settings').rows = tabs.get('Settings').rows.filter(row => row[0] !== 'TICKET_COUNT');
assert.equal(run('publicInfo_().maxParticipants'), 65);
assert.equal(initial.selected,0);
assert.equal(initial.tickets[0].registrationNumber,'001');
assert.equal(initial.tickets[0].checkToken,'2027001');
assert.equal(initial.tickets[51].checkToken,'2027052');
assert.equal(initial.tickets[64].checkToken,'2027065');
assert.equal(new Set(initial.tickets.map(x=>x.token)).size,65);
assert.throws(()=>run('generateTickets_()'),/DRAFT/);
ctx.verifyArgs={checkToken:'2027052'};
assert.throws(()=>run('verifyTicket_(verifyArgs)'),/belum dibuka/);
// Invalid EO entries must not modify saved status.
const valid=initial.tickets.map((t,i)=>({registrationNumber:t.registrationNumber,checkToken:t.checkToken,selected:i<8}));
ctx.invalidSelection=valid.map((v,i)=>({...v,selected:i === 0 ? 'TRUE' : v.selected}));
assert.throws(()=>run('importResults_(invalidSelection)'),/wajib TRUE\/FALSE/);
assert.equal(run('getSetting_("STATUS")'),'TICKETS_READY');
ctx.invalidToken=valid.map(x=>({...x}));ctx.invalidToken[5].checkToken='2027999';
assert.throws(()=>run('importResults_(invalidToken)'),/Token tidak cocok/);
ctx.duplicate=valid.map(x=>({...x}));ctx.duplicate[1].registrationNumber='001';
assert.throws(()=>run('importResults_(duplicate)'),/duplikat/);
ctx.validResults=valid.reverse();
const imported=run('importResults_(validResults)');
assert.equal(imported.status,'LOCKED');
assert.equal(imported.selected,8);
assert.throws(()=>run('importResults_(validResults)'),/satu kali/);
// QR mismatch must not be enough to claim ticket 052.
run("changeStatus_('LOCKED','LIVE')");
const beforeInvalidCheck = snapshot();
for (const checkToken of [undefined, null, '', '2027', '2027abc', '2028001', '20270001', {}, []]) {
  ctx.invalidCheck = { checkToken };
  assert.throws(() => run('verifyTicket_(invalidCheck)'), /tidak valid/);
  assert.equal(snapshot(), beforeInvalidCheck, 'Malformed universal checks must not mutate data');
}
const beforeUnknownCheck = JSON.stringify(tabs.get('Participants').rows);
for (const checkToken of ['2027000', '2027999']) {
  ctx.unknownCheck = { checkToken };
  assert.throws(() => run('verifyTicket_(unknownCheck)'), /tidak ditemukan/);
  assert.equal(JSON.stringify(tabs.get('Participants').rows), beforeUnknownCheck, 'Unknown tickets must not change results or timestamps');
}
ctx.wrongQr={checkToken:'2027052',token:initial.tickets[0].token};
assert.throws(()=>run('verifyTicket_(wrongQr)'),/tidak cocok/);
assert.equal(run('publicInfo_().checked'),0);
const fixedTicketData = JSON.stringify(tabs.get('Participants').rows.map(row => row.slice(0,4)));
ctx.shortWrongQr = { checkToken:'2027052', token:shortToken(initial.tickets[0].token) };
assert.throws(() => run('verifyTicket_(shortWrongQr)'), /tidak cocok/);
assert.equal(JSON.stringify(tabs.get('Participants').rows.map(row => row.slice(0,4))), fixedTicketData, 'Wrong QR check must not mutate ticket data');
for (const token of ['a'.repeat(15), 'a'.repeat(17), 'a'.repeat(32), '+'.repeat(16), '/'.repeat(16), 'g'.repeat(64)]) {
  ctx.invalidQr = { checkToken:'2027052', token };
  assert.throws(() => run('verifyTicket_(invalidQr)'), /tidak valid/);
}
assert.equal(run('publicInfo_().checked'),0);
assert.equal(JSON.stringify(tabs.get('Participants').rows.map(row => row.slice(0,4))), fixedTicketData, 'Invalid token check must not mutate ticket data');
const result1=run('verifyTicket_(verifyArgs)');
assert.equal(result1.registrationNumber,'052');
assert.equal(result1.eligible,false);
assert.equal(result1.alreadyChecked,false);
const result2=run('verifyTicket_(verifyArgs)');
assert.equal(result2.eligible,false);
assert.equal(result2.alreadyChecked,true);
cacheClock += 5001; // Statistik publik boleh tertinggal sampai TTL 5 detik.
assert.equal(run('publicInfo_().checked'),1);
assert.throws(()=>run("assertAdmin_('wrong')"),/salah/);
run("assertAdmin_('testing-password-very-long')");
const request={parameter:{requestId:'secret123',origin:'https://faservid.github.io',payload:JSON.stringify({action:'publicInfo'})}};
ctx.request=request;
const html=run('doPost(request)').html;
assert.ok(html.includes('NBSA_PRIZEPOOL_RESULT'));
assert.ok(!html.includes(initial.tickets[0].token));
ctx.wrongOrigin={parameter:{...request.parameter,origin:'https://attacker.example'}};
assert.ok(!run('doPost(wrongOrigin)').html.includes('NBSA_PRIZEPOOL_RESULT'));
run("changeStatus_('LIVE','CLOSED')");
assert.throws(()=>run('verifyTicket_(verifyArgs)'),/ditutup/);
function admin(action, args = {}) {
  ctx.payload = { action, password: 'testing-password-very-long', ...args };
  return run('dispatch_(payload)');
}
for (const requestedCount of [8, '100', 999]) {
  // Spreadsheet terisolasi di memory, tidak menyentuh acara nyata.
  tabs.clear();
  run('setupProject()');
  const count = Number(requestedCount);
  const generated = admin('adminGenerateTickets', { ticketCount: requestedCount });
  assert.equal(generated.total, count);
  assert.equal(generated.maxParticipants, count);
  assert.equal(generated.selected, 0);
  assert.equal(generated.tickets.at(-1).registrationNumber, String(count).padStart(3, '0'));
  assert.equal(generated.tickets.at(-1).checkToken, `2027${String(count).padStart(3, '0')}`);
  assert.equal(new Set(generated.tickets.map(ticket => ticket.token)).size, count);
  assert.ok(generated.tickets.every(ticket => /^[a-f0-9]{64}$/.test(ticket.token)));
  assert.equal(run('getSetting_("TICKET_COUNT")'), String(count));
  run('setupProject()');
  assert.equal(run('publicInfo_().maxParticipants'), count, 'Setup must preserve configuration');
  let before = snapshot();
  assert.throws(() => admin('adminGenerateTickets', { ticketCount: 65 }), /DRAFT/);
  assert.equal(snapshot(), before, 'Regeneration must not change count or QR');
  const results = generated.tickets.map((ticket, i) => ({
    registrationNumber: ticket.registrationNumber, checkToken: ticket.checkToken, selected: i < 8,
  }));
  assert.throws(() => admin('adminImportResults', { results: results.slice(0, -1) }), new RegExp(`tepat ${count} baris`));
  assert.throws(() => admin('adminImportResults', { results: results.map((row, i) => ({ ...row, selected: i === 0 ? null : row.selected })) }), /wajib TRUE\/FALSE/);
  assert.equal(snapshot(), before, 'Invalid imports must not change saved state');
  const payload = JSON.stringify({ action: 'adminImportResults', password: 'x'.repeat(200), results });
  assert.ok(payload.length < 80000, `${count} results must fit existing payload limit`);
  // Jalur POST dan batas payload juga dites untuk jumlah maksimal.
  ctx.countRequest = { parameter: { requestId: 'count-test', origin: request.parameter.origin,
    payload: JSON.stringify({ action: 'adminImportResults', password: 'testing-password-very-long', results: [...results].reverse() }) } };
  const response = run('doPost(countRequest)').html;
  assert.ok(response.includes('"ok":true'), response);
  assert.equal(run('getSetting_("STATUS")'), 'LOCKED');
  assert.equal(admin('adminStats').selected, 8);
  before = snapshot();
  assert.throws(() => admin('adminImportResults', { results }), /satu kali/);
  assert.equal(snapshot(), before);
  admin('adminGoLive');
  const cachedTickets = JSON.parse(cache.get('tickets:SHEET_TEST').value);
  assert.equal(cachedTickets.length, count, 'LIVE must warm ticket cache, including 999 tickets');
  assert.ok(cachedTickets.every(row => row.length === 4));
  io.reads = [];
  ctx.countVerify = { checkToken: generated.tickets[0].checkToken, token: shortToken(generated.tickets[0].token) };
  assert.equal(run('verifyTicket_(countVerify)').eligible, true);
  assert.equal(run('verifyTicket_(countVerify)').alreadyChecked, true);
  ctx.legacyVerify = { checkToken: generated.tickets[0].checkToken, token: generated.tickets[0].token };
  assert.equal(run('verifyTicket_(legacyVerify)').eligible, true);
  assert.equal(run('verifyTicket_(legacyVerify)').alreadyChecked, true);
  ctx.universalVerify = { checkToken: generated.tickets[0].checkToken };
  assert.equal(run('verifyTicket_(universalVerify)').eligible, true);
  assert.equal(run('verifyTicket_(universalVerify)').alreadyChecked, true);
  assert.deepEqual(io.reads.filter(read => read.sheet === 'Participants'), [
    { sheet: 'Participants', r: 2, c: 1, n: 1, m: 5, locked: true },
  ], 'Warm verification reads one ticket row inside lock, never the entire ticket list');
  assert.equal(lock.waits.at(-1), 100, 'Verification waits at most 100 ms to acquire lock');
  cacheClock += 5001;
  assert.equal(run('publicInfo_().checked'), 1);
  admin('adminClose');
  assert.throws(() => run('verifyTicket_(countVerify)'), /ditutup/);
  run('setSetting_("TICKET_COUNT", "100abc")');
  before = snapshot();
  assert.throws(() => run('publicInfo_()'), /bilangan bulat 8–999/);
  assert.equal(snapshot(), before, 'Invalid stored count must fail, not silently fall back');
}
// Jumlah terpilih mengikuti berkas, termasuk nol dan seluruh tiket; status tetap terkunci.
for (const selectedCount of [0, 1, 3, 7, 9, 65]) {
  tabs.clear(); cache.clear();
  run('setupProject()');
  const generated = admin('adminGenerateTickets', { ticketCount: 65 });
  const results = generated.tickets.map((ticket, i) => ({
    registrationNumber: ticket.registrationNumber, checkToken: ticket.checkToken, selected: i < selectedCount,
  }));
  const imported = admin('adminImportResults', { results: [...results].reverse() });
  assert.equal(imported.selected, selectedCount);
  assert.equal(imported.maxWinners, 65);
  assert.equal(imported.status, 'LOCKED');
  assert.equal(tabs.get('Audit').rows.at(-1)[3], `65 status keikutsertaan dikunci: ${selectedCount} TRUE, ${65 - selectedCount} FALSE`);
  const locked = snapshot();
  assert.throws(() => admin('adminImportResults', { results }), /satu kali/);
  assert.equal(snapshot(), locked);
  const flags = tabs.get('Participants').rows.slice(1).map(row => row[3]);
  tabs.get('Participants').rows[1][3] = 'TRUE';
  const invalid = snapshot();
  assert.throws(() => admin('adminGoLive'), /status TRUE\/FALSE/);
  assert.equal(snapshot(), invalid, 'Non-boolean stored status must fail without changing lifecycle');
  tabs.get('Participants').rows[1][3] = flags[0];
  admin('adminGoLive');
  ctx.dynamicVerify = { checkToken: generated.tickets[0].checkToken };
  assert.equal(run('verifyTicket_(dynamicVerify)').eligible, selectedCount > 0);
  assert.equal(run('verifyTicket_(dynamicVerify)').alreadyChecked, true);
  admin('adminClose');
  assert.deepEqual(tabs.get('Participants').rows.slice(1).map(row => row[3]), flags, 'Verify and close must preserve imported selections');
  assert.throws(() => run('verifyTicket_(dynamicVerify)'), /ditutup/);
}
// Batas POST tetap ditolak sebelum aksi dijalankan.
ctx.oversizedRequest = { parameter: { ...request.parameter, payload: ' '.repeat(80001) } };
assert.ok(run('doPost(oversizedRequest)').html.includes('Payload terlalu besar.'));
// --- PENGUJIAN OPTIMASI SCAN & KONKURENSI ---
// 1. Lock contention: tryLock gagal -> BUSY & envelope retryable: true
tabs.clear(); cache.clear(); props.clear();
run('setupProject()');
props.set('ADMIN_SALT', 'SALT');
props.set('ADMIN_HASH', run('hashText_("SALT|testing-password-very-long")'));
props.set('ALLOWED_ORIGINS', 'https://faservid.github.io');
admin('adminGenerateTickets', { ticketCount: 65 });
const eoList = run('getTicketRows_()').map((r, i) => ({ registrationNumber: r[0], checkToken: r[1], selected: i < 8 }));
admin('adminImportResults', { results: eoList });
admin('adminGoLive');

const testTicket = { checkToken: '2027001', token: shortToken(run('getTicketRows_()')[0][2]) };
ctx.testTicket = testTicket;

// Simulasikan lock sibuk
const beforeBusy = snapshot();
lock.busy = true;
let busyCaught = false;
try {
  run('verifyTicket_(testTicket)');
} catch (e) {
  busyCaught = true;
  assert.equal(e.code, 'BUSY');
  assert.match(e.message, /sibuk/);
}
assert.ok(busyCaught, 'tryLock failure must throw BUSY code');
assert.equal(snapshot(), beforeBusy, 'BUSY contention must not mutate database');

// doPost envelope menyertakan retryable: true untuk error BUSY
ctx.busyPost = { parameter: { requestId: 'busy-1', origin: 'https://faservid.github.io',
  payload: JSON.stringify({ action: 'verify', ...testTicket }) } };
const busyHtml = run('doPost(busyPost)').html;
assert.ok(busyHtml.includes('"retryable":true'), 'BUSY response must have retryable: true');
assert.ok(busyHtml.includes('"ok":false'), 'BUSY response must have ok: false');

// Error non-BUSY (misal token salah) tidak boleh retryable
lock.busy = false;
ctx.badTokenPost = { parameter: { requestId: 'bad-1', origin: 'https://faservid.github.io',
  payload: JSON.stringify({ action: 'verify', checkToken: '2027999', token: testTicket.token }) } };
const badHtml = run('doPost(badTokenPost)').html;
assert.ok(badHtml.includes('"retryable":false'), 'Non-BUSY response must have retryable: false');

// 2. Scan pertama: mengunci row, mencatat waktu dan audit log FIRST_CHECK
io.reads = []; io.events = [];
const scan1 = run('verifyTicket_(testTicket)');
assert.equal(scan1.alreadyChecked, false);
assert.equal(scan1.eligible, true);
assert.equal(scan1.registrationNumber, '001');

// Periksa sequence events: flush terjadi sebelum release lock
assert.ok(io.events.includes('scan:2'), 'Row 2 was scanned');
assert.ok(io.events.indexOf('flush') < io.events.indexOf('release'), 'Flush happened before release');
assert.equal(lock.held, false, 'Lock must be released');

// Periksa audit sheet
const auditRows = tabs.get('Audit').rows;
const firstCheckAudits = auditRows.filter(r => r[1] === 'FIRST_CHECK' && r[2] === '001');
assert.equal(firstCheckAudits.length, 1, 'Exactly one FIRST_CHECK audit');

// Scan ulang tetap membaca status otoritatif, tanpa membaca tiket atau mengambil lock.
io.reads = []; io.events = [];
const waitsBefore = lock.waits.length;
const firstTimestamp = tabs.get('Participants').rows[1][4].toISOString();
const scan2 = run('verifyTicket_(testTicket)');
assert.equal(scan2.alreadyChecked, true);
assert.equal(scan2.eligible, true);
assert.equal(io.reads.length, 2);
assert.ok(io.reads.every(read => read.sheet === 'Settings'), 'Cache hit rechecks session without reading Participants');
assert.equal(lock.waits.length, waitsBefore);
assert.deepEqual(io.events, []);
assert.equal(tabs.get('Participants').rows[1][4].toISOString(), firstTimestamp);

// Interleaving deterministik: request lain selesai setelah baca awal, sebelum lock.
const unverifiedTicket = { checkToken: '2027002', token: shortToken(run('getTicketRows_()')[1][2]) };
ctx.unverifiedTicket = unverifiedTicket;
let nestedResult;
let concurrentTimestamp;
lock.beforeTry = () => {
  nestedResult = run('verifyTicket_(unverifiedTicket)');
  concurrentTimestamp = tabs.get('Participants').rows[2][4].toISOString();
};
io.events = [];
const concurrentResult = run('verifyTicket_(unverifiedTicket)');
assert.equal(nestedResult.alreadyChecked, false);
assert.equal(concurrentResult.alreadyChecked, true);
assert.equal(concurrentResult.eligible, nestedResult.eligible);
assert.equal(tabs.get('Participants').rows[2][4].toISOString(), concurrentTimestamp);
assert.equal(io.events.filter(event => event === 'scan:3').length, 1);
assert.equal(tabs.get('Audit').rows.filter(r => r[1] === 'FIRST_CHECK' && r[2] === '002').length, 1);

// 3. Status CLOSED di tengah in-flight sebelum memperoleh lock harus menolak
const midflightTicket = { checkToken: '2027003', token: shortToken(run('getTicketRows_()')[2][2]) };
ctx.midflightTicket = midflightTicket;
lock.beforeTry = () => {
  tabs.get('Settings').rows.find(r => r[0] === 'STATUS')[1] = 'CLOSED';
};
assert.throws(() => run('verifyTicket_(midflightTicket)'), /ditutup/);
assert.equal(lock.held, false, 'Lock must be released on mid-flight status rejection');
tabs.get('Settings').rows.find(r => r[0] === 'STATUS')[1] = 'LIVE';

// 4. Fail-open cache: jika CacheService error, aplikasi tetap berfungsi via Sheet
cacheBroken = true;
const scanFallback = run('verifyTicket_(testTicket)');
assert.equal(scanFallback.alreadyChecked, true);
assert.equal(scanFallback.eligible, true);
cacheBroken = false;

// 5. Public info caching dan invalidasi
cache.clear();
const pub1 = run('publicInfo_()');
assert.equal(pub1.checked, 2);
// Ubah sheet langsung di belakang cache (tiket 003 belum di-check)
tabs.get('Participants').rows[3][4] = new Date();
const pub2 = run('publicInfo_()');
assert.equal(pub2.checked, 2, 'publicInfo_ must return cached value within TTL');
// publicInfo_(rows) melewati cache
const pub3 = run('publicInfo_(getTicketRows_())');
assert.equal(pub3.checked, 3, 'publicInfo_(rows) must bypass cache and reflect current rows');

// 6. Kegagalan I/O atau flush melepaskan lock dan tidak meracuni cache
// 6a. Scan write failure: timestamp batal ditulis, cache tidak diisi, tiket dapat diverifikasi ulang
const failTicket = { checkToken: '2027004', token: shortToken(run('getTicketRows_()')[3][2]) };
ctx.failTicket = failTicket;
const failSecret = run('getTicketRows_()')[3][2];

io.failScanWrite = true;
assert.throws(() => run('verifyTicket_(failTicket)'), /Scan write failed/);
assert.equal(lock.held, false, 'Lock must be released when scan write throws');
assert.equal(cache.has('checked:SHEET_TEST:2027004:' + failSecret), false);
assert.equal(tabs.get('Participants').rows[4][4], '', 'Timestamp must remain unset when write fails');
const recovered = run('verifyTicket_(failTicket)');
assert.equal(recovered.alreadyChecked, false);
assert.equal(recovered.registrationNumber, '004');
assert.equal(lock.held, false);

// 6b. Audit write failure: lock tetap dilepas, cache tidak diisi hasil sukses
const failAuditTicket = { checkToken: '2027005', token: shortToken(run('getTicketRows_()')[4][2]) };
ctx.failAuditTicket = failAuditTicket;
const failAuditSecret = run('getTicketRows_()')[4][2];
io.failAudit = true;
assert.throws(() => run('verifyTicket_(failAuditTicket)'), /Audit write failed/);
assert.equal(lock.held, false, 'Lock must be released when audit write throws');
assert.equal(cache.has('checked:SHEET_TEST:2027005:' + failAuditSecret), false);

// 6c. Flush failure: lock tetap dilepas, cache tidak diisi hasil sukses
const failFlushTicket = { checkToken: '2027006', token: shortToken(run('getTicketRows_()')[5][2]) };
ctx.failFlushTicket = failFlushTicket;
const failFlushSecret = run('getTicketRows_()')[5][2];
io.failFlush = true;
assert.throws(() => run('verifyTicket_(failFlushTicket)'), /Flush failed/);
assert.equal(lock.held, false, 'Lock must be released when flush throws');
assert.equal(cache.has('checked:SHEET_TEST:2027006:' + failFlushSecret), false);

// --- RESET SESI: tiket tetap, hasil dan timestamp mulai ulang ---
function sessionFixture(count = 8) {
  tabs.clear(); cache.clear();
  run('setupProject()');
  const generated = admin('adminGenerateTickets', { ticketCount: count });
  const results = generated.tickets.map((ticket, i) => ({
    registrationNumber: ticket.registrationNumber, checkToken: ticket.checkToken, selected: i < 3,
  }));
  admin('adminImportResults', { results });
  admin('adminGoLive');
  return { generated, results };
}
const ticketIdentity = () => JSON.stringify(tabs.get('Participants').rows.map(row => row.slice(0, 3)));
const resetStates = ['TICKETS_READY', 'IMPORTING', 'RESETTING', 'LOCKED', 'LIVE', 'CLOSED'];
for (const [i, status] of resetStates.entries()) {
  const count = [8, 65, 100, 999, 8, 65][i];
  const { generated, results } = sessionFixture(count);
  ctx.resetVerify = { checkToken: generated.tickets[0].checkToken };
  run('verifyTicket_(resetVerify)');
  tabs.get('Participants').rows[1][4] = new Date('2000-01-01T00:00:00Z');
  run(`setSetting_('STATUS', '${status}')`);
  if (i === 1) tabs.get('Settings').rows = tabs.get('Settings').rows.filter(row => row[0] !== 'TICKET_COUNT');
  const identity = ticketIdentity();
  const properties = JSON.stringify([...props]);
  const auditBefore = JSON.stringify(tabs.get('Audit').rows);
  const auditLength = tabs.get('Audit').rows.length;
  const reset = admin('adminResetSession');
  assert.equal(reset.status, 'TICKETS_READY');
  assert.equal(reset.total, count);
  assert.equal(reset.maxParticipants, count);
  assert.equal(reset.selected, 0);
  assert.equal(reset.checked, 0);
  assert.equal(reset.lockedAt, '');
  assert.ok(reset.tickets.every(ticket => !ticket.eligible && ticket.checkedAt === ''));
  assert.equal(ticketIdentity(), identity, `${status}: reset must preserve numbers, check tokens and QR secrets`);
  assert.equal(JSON.stringify([...props]), properties, 'Password, origins and spreadsheet configuration stay unchanged');
  assert.equal(JSON.stringify(tabs.get('Audit').rows.slice(0, auditLength)), auditBefore);
  assert.equal(tabs.get('Audit').rows.at(-1)[1], 'RESET_SESSION');
  assert.match(tabs.get('Audit').rows.at(-1)[3], /3 status terpilih dan 1 waktu pengecekan dihapus/);
  assert.ok(run('getSetting_("SESSION_ID")'));
  assert.equal(run('publicInfo_().checked'), 0);
  assert.throws(() => run('verifyTicket_(resetVerify)'), /belum dibuka/);
  assert.throws(() => admin('adminGoLive'), /Status harus LOCKED/);
  assert.throws(() => admin('adminGenerateTickets'), /DRAFT/);
  admin('adminImportResults', { results: results.map(row => ({ ...row, selected: !row.selected })) });
  assert.equal(admin('adminStats').selected, count - 3);
  admin('adminGoLive');
  assert.equal(run('verifyTicket_(resetVerify)').eligible, false, 'Old eligible cache must not survive reset');
  assert.equal(run('verifyTicket_(resetVerify)').alreadyChecked, true);
  const timestamp = tabs.get('Participants').rows[1][4].toISOString();
  assert.notEqual(timestamp, '2000-01-01T00:00:00.000Z');
  ctx.resetVerify.token = shortToken(generated.tickets[0].token);
  assert.equal(run('verifyTicket_(resetVerify)').eligible, false, 'Previously printed legacy QR still matches');
  assert.equal(tabs.get('Participants').rows[1][4].toISOString(), timestamp);
}

// Reset kedua juga mengganti namespace cache; cache rusak bukan sumber kebenaran.
const previousSession = run('getSetting_("SESSION_ID")');
cacheBroken = true;
assert.equal(admin('adminResetSession').status, 'TICKETS_READY');
assert.notEqual(run('getSetting_("SESSION_ID")'), previousSession);
cacheBroken = false;

// Auth dan validasi gagal sebelum ada perubahan data.
const beforeUnauthorizedReset = snapshot();
assert.throws(() => admin('adminResetSession', { password: 'wrong' }), /Password admin salah/);
assert.equal(snapshot(), beforeUnauthorizedReset);
for (const corrupt of [
  () => { tabs.get('Participants').rows.pop(); },
  () => { tabs.get('Participants').rows[1][0] = '000'; },
  () => { tabs.get('Participants').rows[2][0] = '001'; },
  () => { tabs.get('Participants').rows[1][1] = '2027999'; },
  () => { tabs.get('Participants').rows[1][2] = 'invalid'; },
  () => { tabs.get('Participants').rows[2][2] = tabs.get('Participants').rows[1][2]; },
  () => { tabs.get('Participants').rows[0][3] = 'wrong_header'; },
]) {
  sessionFixture(); corrupt();
  const before = snapshot();
  assert.throws(() => admin('adminResetSession'), /Data tiket tidak valid/);
  assert.equal(snapshot(), before, 'Invalid database must not be modified by reset');
  assert.equal(lock.held, false);
}
tabs.clear(); cache.clear(); run('setupProject()');
const draft = snapshot();
assert.throws(() => admin('adminResetSession'), /setelah tiket dibuat/);
assert.equal(snapshot(), draft);

// Gagal di tengah reset tetap menutup verifikasi/impor; admin bisa ulangi reset.
for (const [failure, message] of [['failResetWrite', /Reset write failed/], ['failResetAudit', /Reset audit failed/], ['failFlush', /Flush failed/]]) {
  const { results } = sessionFixture();
  const identity = ticketIdentity();
  io[failure] = true;
  assert.throws(() => admin('adminResetSession'), message);
  assert.equal(lock.held, false);
  assert.equal(ticketIdentity(), identity);
  assert.equal(run('getSetting_("STATUS")'), 'RESETTING');
  assert.throws(() => admin('adminGoLive'), /Status harus LOCKED/);
  assert.throws(() => admin('adminImportResults', { results }), /satu kali/);
  assert.throws(() => run('verifyTicket_({ checkToken: "2027001" })'), /ditutup/);
  assert.equal(admin('adminResetSession').status, 'TICKETS_READY');
}

// Request lama tidak boleh menulis timestamp atau menampilkan hasil sesi baru.
for (const point of ['before-lock', 'cached-result', 'after-lock']) {
  const { results } = sessionFixture();
  if (point === 'cached-result') run('verifyTicket_({ checkToken: "2027001" })');
  const replaceSession = () => {
    admin('adminResetSession');
    admin('adminImportResults', { results: results.map(row => ({ ...row, selected: false })) });
    admin('adminGoLive');
  };
  if (point === 'before-lock') lock.beforeTry = replaceSession;
  if (point === 'cached-result') io.afterRead = name => { assert.equal(name, 'Settings'); replaceSession(); };
  if (point === 'after-lock') io.afterCachePut = key => { assert.match(key, /^checked:/); replaceSession(); };
  assert.throws(() => run('verifyTicket_({ checkToken: "2027001" })'), /Sesi telah direset/);
  assert.equal(tabs.get('Participants').rows[1][4], '', `${point}: old request must not check ticket in new session`);
  const fresh = run('verifyTicket_({ checkToken: "2027001" })');
  assert.equal(fresh.eligible, false);
  assert.equal(fresh.alreadyChecked, false, `${point}: old cache must not mark new session as checked`);
  assert.equal(lock.held, false);
}

console.log('PASS backend: jumlah tiket/terpilih dinamis, CSV boolean, auth, LIVE/CLOSED, short-lock/BUSY, caching, reset 8/65/100/999 tanpa mengganti tiket, pemulihan reset gagal, isolasi cache dan request lintas sesi.');
