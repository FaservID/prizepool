/**
 * Utilitas Data, Format CSV, QR Canvas, dan Ekspor Tiket Garden Bloom
 */
import QRCode from 'qrcode';

export const STATUS_NAMES = {
  DRAFT: 'Belum ada tiket',
  TICKETS_READY: 'QR siap cetak, menunggu hasil EO',
  IMPORTING: 'Impor sedang diverifikasi admin',
  LOCKED: 'Hasil EO terkunci permanen',
  LIVE: 'Hidden Prize LIVE, hasil dapat dicek',
  CLOSED: 'Sesi undian selesai',
};

export function formatDatetime(value) {
  if (!value) return 'Belum tercatat';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function validateTicketCount(value) {
  const count = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(count) || count < 8 || count > 999) throw new Error('Jumlah tiket harus bilangan bulat 8–999.');
  return count;
}

export function normalizeRegistrationNumber(value, maxParticipants = 999) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) throw new Error(`Nomor registrasi tidak valid: ${raw}`);
  const n = Number(raw);
  if (n < 1 || n > maxParticipants) throw new Error(`Nomor registrasi harus 001–${String(maxParticipants).padStart(3, '0')}: ${raw}`);
  return String(n).padStart(3, '0');
}

export function validateTicketSet(tickets, expectedCount = tickets?.length) {
  const count = validateTicketCount(expectedCount);
  if (!Array.isArray(tickets) || tickets.length !== count) throw new Error(`Daftar tiket harus berisi tepat ${count} tiket.`);
  const numbers = new Set();
  for (const ticket of tickets) {
    validatePrintableTicket(ticket);
    if (Number(ticket.registrationNumber) > count || numbers.has(ticket.registrationNumber)) throw new Error('Nomor registrasi di luar rentang atau duplikat.');
    numbers.add(ticket.registrationNumber);
  }
  return count;
}

function parseDelimited(text) {
  const str = String(text).replace(/^﻿/, '');
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

export function parseEoCsv(text, expectedCount = 65) {
  const count = validateTicketCount(expectedCount);
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('CSV kosong atau tidak memiliki data EO.');
  const header = rows[0].map(v => v.toLowerCase().trim());
  const n = header.indexOf('nomor_registrasi');
  const t = header.indexOf('token_pengecekan');
  const s = header.indexOf('terpilih');
  if (n < 0 || t < 0 || s < 0) throw new Error('Header wajib: nomor_registrasi,token_pengecekan,terpilih');
  const result = rows.slice(1).map((r, i) => {
    const registrationNumber = normalizeRegistrationNumber(r[n], count);
    const checkToken = String(r[t] || '').trim();
    if (checkToken !== `2027${registrationNumber}`) throw new Error(`Baris ${i + 2}: token harus 2027${registrationNumber}`);
    const raw = String(r[s] || '').trim().toUpperCase();
    if (raw !== 'TRUE' && raw !== 'FALSE') throw new Error(`Baris ${i + 2}: terpilih wajib TRUE atau FALSE.`);
    return { registrationNumber, checkToken, selected: raw === 'TRUE' };
  });
  if (result.length !== count) throw new Error(`CSV harus berisi tepat ${count} data. Terbaca: ${result.length}.`);
  const numbers = new Set(result.map(r => r.registrationNumber));
  if (numbers.size !== count) throw new Error('Ada nomor registrasi duplikat.');
  const trueCount = result.filter(r => r.selected).length;
  if (trueCount !== 8) throw new Error(`EO harus mengisi tepat 8 TRUE. Saat ini ada ${trueCount}.`);
  return result;
}

export function buildEoCsv(tickets, expectedCount = tickets?.length) {
  validateTicketSet(tickets, expectedCount);
  const rows = [...tickets].sort((a,b)=>a.registrationNumber.localeCompare(b.registrationNumber));
  return '﻿nomor_registrasi,token_pengecekan,terpilih\r\n' +
    rows.map(r => `${r.registrationNumber},${r.checkToken},FALSE`).join('\r\n') + '\r\n';
}

export function downloadText(name, value, mime='text/csv;charset=utf-8') {
  const blob = new Blob([value], { type: mime });
  downloadBlob(blob, name);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  try {
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// CRC32 table untuk ZIP tanpa library pihak ketiga
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Buat berkas ZIP standar PKZIP dari daftar { name, data (Uint8Array) }
 * Zero external dependency, 100% native client-side.
 */
export function createZipBlob(files) {
  if (!Array.isArray(files) || files.length > 65535) throw new Error('Jumlah berkas ZIP tidak valid.');
  const encoder = new TextEncoder();
  const names = new Set();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name || /[\\/\x00]/.test(file.name) || names.has(file.name)) {
      throw new Error('Nama berkas ZIP tidak valid atau duplikat.');
    }
    names.add(file.name);
    const nameBytes = encoder.encode(file.name);
    if (nameBytes.length > 65535) throw new Error('Nama berkas ZIP terlalu panjang.');
    if (!(file.data instanceof Uint8Array) && !(file.data instanceof ArrayBuffer)) {
      throw new Error('Data berkas ZIP harus Uint8Array atau ArrayBuffer.');
    }
    const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const size = dataBytes.length;
    // ponytail: ZIP32 only; add ZIP64 if exports ever exceed 4 GiB.
    if (offset + 30 + nameBytes.length + size > 0xFFFFFFFF) throw new Error('Ukuran ZIP melebihi batas ZIP32.');
    const crc = crc32(dataBytes);

    // Local file header (30 bytes + filename)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(lh.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0x0800, true); // UTF-8 filenames
    lhView.setUint16(8, 0, true); // Stored (tanpa kompresi, cepat & kompatibel)
    lhView.setUint16(10, 0, true);
    lhView.setUint16(12, 0x5821, true); // 2024-01-01
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, size, true);
    lhView.setUint32(22, size, true);
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localChunks.push(lh, dataBytes);

    // Central directory header (46 bytes + filename)
    const ch = new Uint8Array(46 + nameBytes.length);
    const chView = new DataView(ch.buffer);
    chView.setUint32(0, 0x02014b50, true);
    chView.setUint16(4, 20, true);
    chView.setUint16(6, 20, true);
    chView.setUint16(8, 0x0800, true);
    chView.setUint16(10, 0, true);
    chView.setUint16(12, 0, true);
    chView.setUint16(14, 0x5821, true);
    chView.setUint32(16, crc, true);
    chView.setUint32(20, size, true);
    chView.setUint32(24, size, true);
    chView.setUint16(28, nameBytes.length, true);
    chView.setUint16(30, 0, true);
    chView.setUint16(32, 0, true);
    chView.setUint16(34, 0, true);
    chView.setUint16(36, 0, true);
    chView.setUint32(38, 0, true);
    chView.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    centralChunks.push(ch);
    offset += lh.length + size;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralChunks) centralDirSize += c.length;
  if (centralDirOffset + centralDirSize > 0xFFFFFFFF) throw new Error('Ukuran ZIP melebihi batas ZIP32.');

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);
  eocdView.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, eocd], { type: 'application/zip' });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof src !== 'string' || !/^(data:image\/|blob:)/i.test(src)) {
      reject(new Error('Logo harus berasal dari unggahan gambar lokal.'));
      return;
    }
    const img = new Image();
    const finish = (error) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      if (error) reject(error);
      else resolve(img);
    };
    const timer = setTimeout(() => finish(new Error('Logo terlalu lama dimuat.')), 15000);
    img.onload = () => finish(img.naturalWidth && img.naturalHeight ? null : new Error('Dimensi logo tidak valid.'));
    img.onerror = () => finish(new Error('Logo gagal dibaca. Unggah gambar lain.'));
    img.src = src;
  });
}

function colorLuminance(color) {
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) throw new Error('Warna QR harus berupa HEX enam digit tanpa transparansi.');
  const channels = color.slice(1).match(/../g).map(v => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/**
 * H corrects damaged codewords, not a fixed logo area. Scan-test final print.
 * Keep four-module quiet zone and function patterns clear of the centered logo.
 */
export async function generateQrCanvas(text, options = {}) {
  const {
    size = 480,
    logoSrc = '',
    logoSizePercent = 16,
    badgeShape = 'circle',
    darkColor = '#173f35',
    lightColor = '#ffffff',
  } = options;
  if (!Number.isInteger(size) || size < 128 || size > 4096) throw new Error('Ukuran QR harus 128 sampai 4096 piksel.');
  if (!Number.isFinite(logoSizePercent)) throw new Error('Ukuran logo tidak valid.');
  if (!['circle', 'square'].includes(badgeShape)) throw new Error('Bentuk bingkai logo tidak valid.');
  const dark = colorLuminance(darkColor);
  const light = colorLuminance(lightColor);
  if ((light + 0.05) / (dark + 0.05) < 4.5) throw new Error('QR memerlukan warna gelap di atas latar terang dengan kontras minimal 4,5:1.');
  const logoRatio = Math.max(10, Math.min(18, logoSizePercent)) / 100;
  const badgeRatio = Math.min(0.22, logoRatio * 1.2);
  let qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  // Choose a version whose entire centered badge clears mandatory QR patterns.
  while (logoSrc) {
    const start = Math.floor(qr.modules.size * (1 - badgeRatio) / 2);
    const end = qr.modules.size - start;
    let overlaps = false;
    for (let row = start; row < end && !overlaps; row++) {
      for (let col = start; col < end; col++) {
        if (qr.modules.isReserved(row, col)) { overlaps = true; break; }
      }
    }
    if (!overlaps) break;
    if (qr.version === 40) throw new Error('Logo menutupi pola wajib QR. Perkecil logo atau pendekkan URL.');
    qr = QRCode.create(text, { errorCorrectionLevel: 'H', version: qr.version + 1 });
  }
  const modules = qr.modules;
  const scale = Math.floor(size / (modules.size + 8));
  if (scale < 2) throw new Error('QR terlalu padat. Perbesar ukuran QR atau pendekkan URL.');
  const offset = Math.floor((size - modules.size * scale) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas QR tidak tersedia di browser ini.');
  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, size, size);
  const paintModule = (row, col) => {
    ctx.fillStyle = modules.get(row, col) ? darkColor : lightColor;
    ctx.fillRect(offset + col * scale, offset + row * scale, scale, scale);
  };
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) paintModule(row, col);
  }
  if (logoSrc) {
    const logoImg = await loadImage(logoSrc);
    const center = offset + modules.size * scale / 2;
    const symbolSize = modules.size * scale;
    const logoSize = symbolSize * logoRatio;
    const badgeSize = symbolSize * badgeRatio;
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    if (badgeShape === 'square') {
      ctx.roundRect(center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize, badgeSize * 0.15);
    } else {
      ctx.arc(center, center, badgeSize / 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    if (badgeShape === 'square') {
      ctx.roundRect(center - logoSize / 2, center - logoSize / 2, logoSize, logoSize, logoSize * 0.15);
    } else {
      ctx.arc(center, center, logoSize / 2, 0, Math.PI * 2);
    }
    ctx.clip();
    const fit = logoSize / Math.max(logoImg.naturalWidth, logoImg.naturalHeight);
    const dw = logoImg.naturalWidth * fit;
    const dh = logoImg.naturalHeight * fit;
    ctx.drawImage(logoImg, center - dw / 2, center - dh / 2, dw, dh);
    ctx.restore();
  }
  return canvas;
}

function validatePrintableTicket(ticket) {
  if (!ticket || normalizeRegistrationNumber(ticket.registrationNumber) !== ticket.registrationNumber || ticket.checkToken !== `2027${ticket.registrationNumber}`) {
    throw new Error('Nomor registrasi atau token pengecekan tiket tidak valid.');
  }
}

/** Kartu 1440 x 2080 piksel; tata letak dasar 720 x 1040. */
export async function renderTicketCardToCanvas(ticket, qrCanvas, options = {}) {
  validatePrintableTicket(ticket);
  if (!qrCanvas || !qrCanvas.width || qrCanvas.width !== qrCanvas.height) throw new Error('Canvas QR tiket tidak valid.');
  if (document.fonts) await document.fonts.ready;
  const {
    companyName = '',
    eventTitle = 'NBSA Hidden Prize 2027',
    eventSubtitle = 'GARDEN BLOOM CELEBRATION',
  } = options;

  const width = 720;
  const height = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas kartu tiket tidak tersedia di browser ini.');
  ctx.scale(2, 2);
  const fitText = (text, x, y) => ctx.fillText(String(text), x, y, width - 96);

  // Latar belakang warm botanical parchment
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, width, height);

  // Bingkai luar ganda Garden Bloom
  ctx.strokeStyle = '#173f35';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  ctx.strokeStyle = '#d6e0d4';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 32, width - 64, height - 64);

  // Ornamen sudut botanical sederhana & tajam
  const drawCornerFlourish = (x, y, flipX, flipY) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.strokeStyle = '#b8862d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.quadraticCurveTo(24, 6, 26, 26);
    ctx.moveTo(2, 10);
    ctx.quadraticCurveTo(6, 24, 26, 26);
    ctx.stroke();

    ctx.fillStyle = '#c85a48';
    ctx.beginPath();
    ctx.arc(26, 26, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawCornerFlourish(40, 40, false, false);
  drawCornerFlourish(width - 40, 40, true, false);
  drawCornerFlourish(40, height - 40, false, true);
  drawCornerFlourish(width - 40, height - 40, true, true);

  // Header Kartu
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Nama Perusahaan
  ctx.fillStyle = '#4f6155';
  ctx.font = '600 13px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  fitText(String(companyName).toUpperCase(), width / 2, 54);

  // Tagline Tema Acara
  ctx.fillStyle = '#c85a48';
  ctx.font = '700 14px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  fitText(`• ${eventSubtitle} •`, width / 2, 80);

  // Judul Acara
  ctx.fillStyle = '#173f35';
  ctx.font = '800 32px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '0.5px';
  fitText(eventTitle, width / 2, 108);

  // Garis ornamen daun pemisah
  ctx.strokeStyle = '#d6e0d4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(120, 160);
  ctx.lineTo(width - 120, 160);
  ctx.stroke();

  // Kotak Sorot Nomor Registrasi
  const regBoxY = 176;
  const regBoxW = 480;
  const regBoxH = 82;
  const regBoxX = (width - regBoxW) / 2;

  ctx.fillStyle = '#eef4ec';
  ctx.strokeStyle = '#c5d8c3';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(regBoxX, regBoxY, regBoxW, regBoxH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#4f6155';
  ctx.font = '700 12px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('TIKET REGISTRASI PESERTA', width / 2, regBoxY + 14);

  ctx.fillStyle = '#173f35';
  ctx.font = '800 36px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`NOMOR ${ticket.registrationNumber}`, width / 2, regBoxY + 34);

  // Kotak Penyangga QR Code
  const qrBoxSize = 430;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = 282;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dbe4d8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 16);
  ctx.fill();
  ctx.stroke();

  // Gambar QR Code di tengah kotak
  const qrPadding = 24;
  const qrRenderSize = qrBoxSize - (qrPadding * 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qrBoxX + qrPadding, qrBoxY + qrPadding, qrRenderSize, qrRenderSize);

  // Kotak Token Pengecekan
  const tokenBoxY = 730;
  const tokenBoxW = 460;
  const tokenBoxH = 92;
  const tokenBoxX = (width - tokenBoxW) / 2;

  ctx.fillStyle = '#f7f4ed';
  ctx.strokeStyle = '#e2dacb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(tokenBoxX, tokenBoxY, tokenBoxW, tokenBoxH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#4f6155';
  ctx.font = '600 12px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('TOKEN PENGECEKAN TIKET (7 DIGIT)', width / 2, tokenBoxY + 16);

  ctx.fillStyle = '#173f35';
  ctx.font = '800 38px "Outfit", monospace, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(ticket.checkToken, width / 2, tokenBoxY + 38);

  // Garis perforasi kupon
  ctx.strokeStyle = '#a6b5a2';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(48, 856);
  ctx.lineTo(width - 48, 856);
  ctx.stroke();
  ctx.setLineDash([]);

  // Notasi Gunting / Robek
  ctx.fillStyle = '#6b7d6f';
  ctx.font = '600 11px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '1.5px';
  fitText('SIMPAN TIKET INI HINGGA SESI SELESAI', width / 2, 868);

  // Petunjuk untuk Peserta
  ctx.fillStyle = '#2d3b32';
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '0px';
  fitText('1. Pindai QR menggunakan kamera ponsel atau pembaca QR.', width / 2, 898);
  fitText(`2. Masukkan token ${ticket.checkToken} saat sesi Hidden Prize dibuka panitia.`, width / 2, 922);

  ctx.fillStyle = '#7a8c7e';
  ctx.font = '400 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
  fitText('Satu tiket berlaku untuk satu karyawan. Keputusan hasil undian ditetapkan oleh EO.', width / 2, 954);

  return canvas;
}

/**
 * Konversi canvas ke blob JPEG berkualitas tinggi
 */
export function canvasToJpegBlob(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!canvas?.width || !canvas?.height || typeof canvas.toBlob !== 'function') throw new Error('Canvas JPEG tidak valid.');
    if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('Kualitas JPEG harus 0 sampai 1.');
    canvas.toBlob((blob) => {
      if (!blob?.size || blob.type !== 'image/jpeg') reject(new Error('Browser gagal membuat berkas JPEG.'));
      else resolve(blob);
    }, 'image/jpeg', quality);
  });
}

/** Ekspor QR saja sebagai JPG individual dalam ZIP, tanpa desain kartu. */
export async function bulkGenerateTicketsZip(
  tickets,
  getParticipantUrl,
  qrOptions = {},
  onProgress = null,
  expectedCount = tickets?.length
) {
  const count = validateTicketSet(tickets, expectedCount);
  if (typeof getParticipantUrl !== 'function') {
    throw new Error('Fungsi URL peserta wajib disediakan.');
  }

  const tokens = new Set();
  for (const ticket of tickets) {
    if (!/^[a-f0-9]{64}$/i.test(ticket.token || '') || tokens.has(ticket.token.toLowerCase())) {
      throw new Error('Nomor atau QR rahasia tiket tidak valid atau duplikat.');
    }
    tokens.add(ticket.token.toLowerCase());
  }
  const files = [];
  const total = count;

  for (let i = 0; i < total; i++) {
    const ticket = tickets[i];
    const url = getParticipantUrl(ticket.token);
    if (!url || typeof url !== 'string') {
      throw new Error(`URL peserta tiket ${ticket.registrationNumber} tidak valid.`);
    }

    try {
      const qrCanvas = await generateQrCanvas(url, qrOptions);
      const blob = await canvasToJpegBlob(qrCanvas, 0.95);
      const arrayBuffer = await blob.arrayBuffer();

      files.push({
        name: `Tiket_GardenBloom_${ticket.registrationNumber}.jpg`,
        data: new Uint8Array(arrayBuffer),
      });

      if (typeof onProgress === 'function') {
        onProgress(i + 1, total, ticket.registrationNumber);
      }
    } catch (err) {
      throw new Error(`Gagal memproses tiket ${ticket.registrationNumber}: ${err.message}`);
    }
  }

  return createZipBlob(files);
}
