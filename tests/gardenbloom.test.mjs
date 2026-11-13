import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { participantUrl } from '../src/api.js';
import {
  formatDatetime, createZipBlob, generateQrCanvas, renderTicketCardToCanvas,
  canvasToJpegBlob, bulkGenerateTicketsZip, downloadBlob,
} from '../src/utils.js';

const tickets = Array.from({ length: 65 }, (_, i) => {
  const registrationNumber = String(i + 1).padStart(3, '0');
  return { registrationNumber, checkToken: `2027${registrationNumber}`, token: (i + 1).toString(16).padStart(64, '0') };
});

// Canvas recorder tests geometry and failure handling, not browser rasterization or QR decoding.
function browserMock(t, { noContext = false, imageError = false, jpeg = new Blob(['jpeg'], { type: 'image/jpeg' }) } = {}) {
  const canvases = [];
  const images = [];
  const origDoc = globalThis.document;
  const origImg = globalThis.Image;
  const origWin = globalThis.window;
  globalThis.window = { location: { origin: 'https://example.test' } };
  t.after(() => {
    globalThis.document = origDoc;
    globalThis.Image = origImg;
    globalThis.window = origWin;
  });
  const makeCanvas = () => {
    const calls = [];
    const ctx = { calls, fillStyle: '', letterSpacing: '0px' };
    for (const name of ['fillRect', 'strokeRect', 'scale', 'save', 'restore', 'translate', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc', 'roundRect', 'clip', 'drawImage', 'setLineDash', 'fillText']) {
      ctx[name] = (...args) => calls.push({ name, args, color: ctx.fillStyle, spacing: ctx.letterSpacing, smoothing: ctx.imageSmoothingEnabled });
    }
    const canvas = {
      width: 0, height: 0, ctx,
      getContext: () => noContext ? null : ctx,
      toBlob: (callback, type, quality) => { canvas.encoding = { type, quality }; callback(jpeg); },
    };
    canvases.push(canvas);
    return canvas;
  };
  globalThis.document = { createElement: makeCanvas, fonts: { ready: Promise.resolve() } };
  globalThis.Image = class {
    naturalWidth = 200;
    naturalHeight = 100;
    set src(value) {
      images.push(value);
      queueMicrotask(() => imageError ? this.onerror?.() : this.onload?.());
    }
  };
  return { canvases, images };
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function unzipStored(blob) {
  assert.equal(blob.type, 'application/zip');
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  assert.equal(view.getUint16(end + 8, true), count);
  let central = view.getUint32(end + 16, true);
  const centralStart = central;
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(central, true), 0x02014b50);
    assert.equal(view.getUint16(central + 8, true), 0x0800);
    assert.equal(view.getUint16(central + 10, true), 0);
    const local = view.getUint32(central + 42, true);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint16(local + 6, true), 0x0800);
    assert.equal(view.getUint16(local + 8, true), 0);
    const nameLength = view.getUint16(local + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + nameLength));
    const centralNameLength = view.getUint16(central + 28, true);
    assert.equal(nameLength, centralNameLength);
    assert.equal(new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + centralNameLength)), name);
    const size = view.getUint32(local + 18, true);
    assert.equal(size, view.getUint32(local + 22, true));
    assert.equal(size, view.getUint32(central + 20, true));
    assert.equal(size, view.getUint32(central + 24, true));
    const data = bytes.slice(local + 30 + nameLength, local + 30 + nameLength + size);
    assert.equal(crc32(data), view.getUint32(local + 14, true));
    assert.equal(crc32(data), view.getUint32(central + 16, true));
    files.push({ name, data });
    central += 46 + centralNameLength;
  }
  assert.equal(central, end);
  assert.equal(view.getUint32(end + 12, true), central - centralStart);
  return files;
}

test('Datetime fallback stays Indonesian', () => {
  assert.equal(formatDatetime(null), 'Belum tercatat');
  assert.equal(formatDatetime(''), 'Belum tercatat');
  assert.equal(formatDatetime('invalid'), 'invalid');
});

test('ZIP headers, UTF-8 names, CRC, offsets and byte views round-trip', async () => {
  const view = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4);
  const files = [
    { name: 'Tiket_001.jpg', data: view },
    { name: 'Tiket_é.jpg', data: new TextEncoder().encode('123456789') },
    { name: 'empty.jpg', data: new ArrayBuffer(0) },
  ];
  assert.deepEqual(await unzipStored(createZipBlob(files)), files.map(f => ({ ...f, data: new Uint8Array(f.data) })));
  assert.deepEqual(await unzipStored(createZipBlob([])), []);
});

test('ZIP rejects malformed input instead of silently creating empty or corrupt files', () => {
  assert.throws(() => createZipBlob(null), /Jumlah/);
  assert.throws(() => createZipBlob(Array(65536)), /Jumlah/);
  for (const name of ['', '../bad.jpg', 'bad\\file.jpg', 'bad\0.jpg']) {
    assert.throws(() => createZipBlob([{ name, data: new Uint8Array() }]), /Nama/);
  }
  assert.throws(() => createZipBlob([{ name: 'a.jpg', data: 'jpeg' }]), /Data/);
  assert.throws(() => createZipBlob([{ name: 'a'.repeat(65536), data: new Uint8Array() }]), /panjang/);
  assert.throws(() => createZipBlob(Array(2).fill({ name: 'a.jpg', data: new Uint8Array() })), /duplikat/);
});

test('QR keeps integer modules and at least four-module quiet zone', async t => {
  browserMock(t);
  for (const size of [320, 400, 512]) {
    const text = participantUrl(tickets[0].token);
    const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
    const canvas = await generateQrCanvas(text, { size });
    assert.equal(canvas.width, size);
    assert.equal(canvas.height, size);
    const modules = canvas.ctx.calls.filter(c => c.name === 'fillRect').slice(1);
    assert.equal(modules.length, qr.modules.size ** 2);
    const scale = Math.floor(size / (qr.modules.size + 8));
    for (const { args: [x, y, width, height] } of modules) {
      assert.ok(x >= scale * 4 && y >= scale * 4);
      assert.ok(x + width <= size - scale * 4 && y + height <= size - scale * 4);
      assert.equal(width, scale);
      assert.equal(height, scale);
      assert.ok(Number.isInteger(x) && Number.isInteger(y));
    }
  }
});

test('Participant URLs omit ticket data and retain H correction with logos', async t => {
  browserMock(t);
  const url = participantUrl();
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://example.test');
  assert.equal(parsed.pathname, '/');
  assert.equal(parsed.search, '');
  assert.equal(url, participantUrl('0123456789abcdef'.repeat(4)));
  for (const logoSrc of ['', 'data:image/png;base64,local']) {
    const qr = await generateQrCanvas(url, { logoSrc });
    const moduleCount = Math.sqrt(qr.ctx.calls.filter(call => call.name === 'fillRect').length - 1);
    assert.equal(moduleCount, QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size);
  }
});

test('Centered logo stays unobstructed without covering mandatory QR patterns', async t => {
  const { images } = browserMock(t);
  // Original versions 7+ can place alignment patterns in the logo area.
  for (const text of ['short', participantUrl(tickets[0].token), 'https://example.test/' + 'x'.repeat(220)]) {
    for (const badgeShape of ['circle', 'square']) for (const logoSizePercent of [10, 16, 30]) {
      const size = 512;
      const canvas = await generateQrCanvas(text, { size, logoSrc: 'data:image/png;base64,local', logoSizePercent, badgeShape });
      const calls = canvas.ctx.calls;
      const painted = calls.filter(c => c.name === 'fillRect').slice(1);
      const moduleCount = Math.sqrt(painted.length);
      const qr = QRCode.create(text, { errorCorrectionLevel: 'H', version: (moduleCount - 17) / 4 });
      assert.equal(qr.modules.size, moduleCount);
      const scale = Math.floor(size / (moduleCount + 8));
      const offset = Math.floor((size - moduleCount * scale) / 2);
      const center = offset + moduleCount * scale / 2;
      const symbolSize = moduleCount * scale;
      const imageIndex = calls.findIndex(c => c.name === 'drawImage');
      const [image, x, y, width, height] = calls[imageIndex].args;
      assert.equal(image.naturalWidth / image.naturalHeight, width / height);
      assert.equal(x + width / 2, center);
      assert.equal(y + height / 2, center);
      assert.ok(width <= symbolSize * 0.18 + 1e-9);
      const badge = calls.find(c => c.name === (badgeShape === 'square' ? 'roundRect' : 'arc'));
      const badgeSize = badgeShape === 'square' ? badge.args[2] : badge.args[2] * 2;
      assert.ok(badgeSize <= symbolSize * 0.22);
      for (let row = 0; row < moduleCount; row++) for (let col = 0; col < moduleCount; col++) {
        const module = painted[row * moduleCount + col];
        const left = offset + col * scale;
        const top = offset + row * scale;
        assert.deepEqual(module.args, [left, top, scale, scale]);
        assert.equal(module.color, qr.modules.get(row, col) ? '#173f35' : '#ffffff');
        assert.ok(left >= 4 * scale && top >= 4 * scale);
        assert.ok(left + scale <= size - 4 * scale && top + scale <= size - 4 * scale);
        if (qr.modules.isReserved(row, col)) {
          assert.ok(left + scale <= center - badgeSize / 2 || left >= center + badgeSize / 2
            || top + scale <= center - badgeSize / 2 || top >= center + badgeSize / 2,
          'Badge must not obscure any mandatory QR module');
        }
      }
      assert.deepEqual(calls.slice(imageIndex + 1).map(c => c.name), ['restore']);
      assert.ok(!calls.some(c => c.name === 'stroke'), 'No border beyond badge coverage');
    }
  }
  assert.equal(images.length, 18);
});

test('QR rejects invalid dimensions, transparent/inverted/low-contrast colors and remote logos', async t => {
  const { images } = browserMock(t);
  for (const size of [0, 127, 4097, NaN, 200.5]) await assert.rejects(generateQrCanvas('x', { size }), /Ukuran QR/);
  await assert.rejects(generateQrCanvas('x', { logoSizePercent: NaN }), /Ukuran logo/);
  await assert.rejects(generateQrCanvas('x', { badgeShape: 'triangle' }), /Bentuk/);
  await assert.rejects(generateQrCanvas('x', { darkColor: '#ffffff' }), /kontras/);
  await assert.rejects(generateQrCanvas('x', { darkColor: '#173f3500' }), /HEX/);
  await assert.rejects(generateQrCanvas('x', { lightColor: '#000000' }), /kontras/);
  await assert.rejects(generateQrCanvas('x', { logoSrc: 'https://example.test/logo.png' }), /lokal/);
  assert.equal(images.length, 0, 'Remote image must never load');
  await assert.rejects(generateQrCanvas('x'.repeat(1000), { size: 128 }), /padat/);
});

test('Invalid uploaded image rejects instead of silently omitting logo', async t => {
  browserMock(t, { imageError: true });
  await assert.rejects(generateQrCanvas('x', { logoSrc: 'data:image/png;base64,broken' }), /Logo gagal/);
});

test('Missing canvas context fails explicitly for QR and card', async t => {
  browserMock(t, { noContext: true });
  await assert.rejects(generateQrCanvas('x'), /Canvas QR/);
  await assert.rejects(renderTicketCardToCanvas(tickets[0], { width: 512, height: 512 }), /Canvas kartu/);
});

test('Ticket card doubles pixel resolution, disables QR smoothing, fits custom text and awaits fonts', async t => {
  browserMock(t);
  let ready = false;
  document.fonts.ready = Promise.resolve().then(() => { ready = true; });
  const qr = await generateQrCanvas(participantUrl(tickets[0].token), { size: 1024 });
  const card = await renderTicketCardToCanvas(tickets[0], qr, { companyName: 'Company '.repeat(50) });
  assert.ok(ready);
  assert.equal(card.width, 1440);
  assert.equal(card.height, 2080);
  assert.deepEqual(card.ctx.calls[0].args, [2, 2]);
  const draw = card.ctx.calls.find(c => c.name === 'drawImage');
  assert.equal(draw.smoothing, false);
  const customName = card.ctx.calls.find(c => c.name === 'fillText' && c.args[0].startsWith('COMPANY'));
  assert.equal(customName.args[3], 624);
  const instructions = card.ctx.calls.find(c => c.name === 'fillText' && c.args[0].startsWith('1. Pindai'));
  assert.equal(instructions.spacing, '0px');
  const text = card.ctx.calls.filter(c => c.name === 'fillText').map(c => c.args[0]).join('\n');
  assert.doesNotMatch(text, /\bEO\b/);
  assert.match(text, /Tunjukkan tiket fisik asli kepada panitia\./);
  const defaultCard = await renderTicketCardToCanvas(tickets[0], qr);
  assert.ok(!defaultCard.ctx.calls.some(c => c.name === 'fillText' && /NUSANTARA/.test(c.args[0])));
  await assert.rejects(renderTicketCardToCanvas({ ...tickets[0], checkToken: '2027002' }, qr), /token pengecekan/);
});

test('JPEG rejects null, empty, unsupported output, invalid quality and thrown security errors', async () => {
  const canvas = blob => ({ width: 1440, height: 2080, toBlob: callback => callback(blob) });
  for (const blob of [null, new Blob([], { type: 'image/jpeg' }), new Blob(['png'], { type: 'image/png' })]) {
    await assert.rejects(canvasToJpegBlob(canvas(blob)), /gagal membuat/);
  }
  await assert.rejects(canvasToJpegBlob(canvas(null), NaN), /Kualitas/);
  await assert.rejects(canvasToJpegBlob({ width: 0 }), /Canvas JPEG/);
  await assert.rejects(canvasToJpegBlob({ width: 1, height: 1, toBlob() { throw new Error('SecurityError'); } }), /SecurityError/);
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  assert.equal(await canvasToJpegBlob(canvas(jpeg)), jpeg);
});

test('Bulk export requires valid distinct ticket pairs before rendering', async () => {
  await assert.rejects(bulkGenerateTicketsZip(tickets.slice(1), participantUrl, {}, null, 65), /tepat 65 tiket/);
  await assert.rejects(bulkGenerateTicketsZip(tickets.slice(1), participantUrl), /Nomor registrasi di luar rentang atau duplikat/);
  await assert.rejects(bulkGenerateTicketsZip(tickets, null), /Fungsi URL/);
  await assert.rejects(bulkGenerateTicketsZip(Array(65).fill(tickets[0]), participantUrl), /duplikat/);
  await assert.rejects(bulkGenerateTicketsZip(tickets.map((v, i) => i ? v : { ...v, checkToken: '2027999' }), participantUrl), /token pengecekan/);
  await assert.rejects(bulkGenerateTicketsZip(tickets, () => ''), /URL peserta/);
});

test('Bulk exports identical universal QR images without requiring ticket secrets', async t => {
  const { canvases } = browserMock(t);
  const smallTickets = Array.from({ length: 8 }, (_, i) => {
    const registrationNumber = String(i + 1).padStart(3, '0');
    return { registrationNumber, checkToken: `2027${registrationNumber}` };
  });
  const progress = [];
  const zip = await bulkGenerateTicketsZip(smallTickets, (...args) => {
    assert.deepEqual(args, [], 'QR URL must not depend on a ticket secret');
    return participantUrl();
  }, { size: 1024 }, (...args) => progress.push(args), 8);
  const files = await unzipStored(zip);
  assert.equal(files.length, 8);
  assert.equal(files[0].name, 'Tiket_GardenBloom_001.jpg');
  assert.equal(files[7].name, 'Tiket_GardenBloom_008.jpg');
  assert.deepEqual(progress[0], [1, 8, '001']);
  assert.deepEqual(progress[7], [8, 8, '008']);
  assert.equal(canvases.length, 8, 'One QR canvas per ticket, without card canvas');
  for (const canvas of canvases) {
    assert.equal(canvas.width, 1024);
    assert.equal(canvas.height, 1024);
    assert.deepEqual(canvas.encoding, { type: 'image/jpeg', quality: 0.95 });
    assert.ok(canvas.ctx.calls.every(call => call.name === 'fillRect'), 'Only QR modules and quiet zone, without text or decoration');
  }
});

test('Bulk creates exactly 65 individual JPG entries and reports completed progress', async t => {
  browserMock(t);
  const progress = [];
  const zip = await bulkGenerateTicketsZip(tickets, participantUrl, {}, (...args) => progress.push(args));
  const files = await unzipStored(zip);
  assert.equal(files.length, 65);
  assert.equal(new Set(files.map(f => f.name)).size, 65);
  assert.equal(files[0].name, 'Tiket_GardenBloom_001.jpg');
  assert.equal(files[64].name, 'Tiket_GardenBloom_065.jpg');
  assert.deepEqual(progress[0], [1, 65, '001']);
  assert.deepEqual(progress[64], [65, 65, '065']);
});

test('Bulk JPEG failure rejects whole export with ticket number, without false progress', async t => {
  browserMock(t, { jpeg: null });
  const progress = [];
  await assert.rejects(bulkGenerateTicketsZip(tickets, participantUrl, {}, (...args) => progress.push(args)), /tiket 001: Browser gagal membuat/);
  assert.deepEqual(progress, []);
});

test('Download cleans anchor and schedules URL revocation even when click throws', t => {
  let removed = false;
  let revoked = '';
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  t.after(() => {
    globalThis.document = origDoc;
    globalThis.window = origWin;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
  globalThis.document = {
    createElement: () => ({ click() { throw new Error('blocked'); }, remove() { removed = true; } }),
    body: { appendChild() {} },
  };
  globalThis.window = { setTimeout: callback => callback() };
  URL.createObjectURL = () => 'blob:download';
  URL.revokeObjectURL = url => { revoked = url; };
  assert.throws(() => downloadBlob(new Blob(['jpeg']), 'ticket.jpg'), /blocked/);
  assert.ok(removed);
  assert.equal(revoked, 'blob:download');
});
