export const STATUS_NAMES = {
  DRAFT: 'Belum ada tiket',
  TICKETS_READY: '65 QR siap cetak / menunggu EO',
  IMPORTING: 'Impor sedang dikunci (perlu pemeriksaan admin)',
  LOCKED: 'Hasil EO terkunci',
  LIVE: 'Prize Pool LIVE',
  CLOSED: 'Sesi selesai',
};

export function formatDatetime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function normalizeRegistrationNumber(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) throw new Error(`Nomor registrasi tidak valid: ${raw}`);
  const n = Number(raw);
  if (n < 1 || n > 65) throw new Error(`Nomor registrasi harus 001–065: ${raw}`);
  return String(n).padStart(3, '0');
}

function parseDelimited(text) {
  const str = String(text).replace(/^\uFEFF/, '');
  const firstLine = str.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      if (quoted && str[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      row.push(cell.trim()); cell = '';
      if (char === delimiter) continue;
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      if (char === '\r' && str[i + 1] === '\n') i++;
    } else cell += char;
  }
  if (quoted) throw new Error('Format CSV salah: tanda kutip belum ditutup.');
  row.push(cell.trim());
  if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

export function parseEoCsv(text) {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('CSV kosong atau tidak memiliki data EO.');
  const header = rows[0].map(v => v.toLowerCase().trim());
  const n = header.indexOf('nomor_registrasi');
  const t = header.indexOf('token_pengecekan');
  const s = header.indexOf('terpilih');
  if (n < 0 || t < 0 || s < 0) throw new Error('Header wajib: nomor_registrasi,token_pengecekan,terpilih');
  const result = rows.slice(1).map((r, i) => {
    const registrationNumber = normalizeRegistrationNumber(r[n]);
    const checkToken = String(r[t] || '').trim();
    if (checkToken !== `2027${registrationNumber}`) throw new Error(`Baris ${i + 2}: token harus 2027${registrationNumber}`);
    const raw = String(r[s] || '').trim().toUpperCase();
    if (raw !== 'TRUE' && raw !== 'FALSE') throw new Error(`Baris ${i + 2}: terpilih wajib TRUE atau FALSE.`);
    return { registrationNumber, checkToken, selected: raw === 'TRUE' };
  });
  if (result.length !== 65) throw new Error(`CSV harus berisi tepat 65 data. Terbaca: ${result.length}.`);
  const numbers = new Set(result.map(r => r.registrationNumber));
  if (numbers.size !== 65) throw new Error('Ada nomor registrasi duplikat.');
  const trueCount = result.filter(r => r.selected).length;
  if (trueCount !== 8) throw new Error(`EO harus mengisi tepat 8 TRUE. Saat ini ada ${trueCount}.`);
  return result;
}

export function buildEoCsv(tickets) {
  if (!Array.isArray(tickets) || tickets.length !== 65) throw new Error('Buat 65 tiket terlebih dahulu.');
  const rows = [...tickets].sort((a,b)=>a.registrationNumber.localeCompare(b.registrationNumber));
  return '\uFEFFnomor_registrasi,token_pengecekan,terpilih\r\n' +
    rows.map(r => `${r.registrationNumber},${r.checkToken},FALSE`).join('\r\n') + '\r\n';
}

export function downloadText(name, value, mime='text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([value], {type:mime}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
