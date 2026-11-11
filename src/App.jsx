import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isConfigured, participantUrl, prizePoolRequest } from './api.js';
import {
  STATUS_NAMES,
  buildEoCsv,
  bulkGenerateTicketsZip,
  canvasToJpegBlob,
  downloadBlob,
  downloadText,
  formatDatetime,
  generateQrCanvas,
  parseEoCsv,
  renderTicketCardToCanvas,
  validateTicketCount,
  validateTicketSet,
} from './utils.js';

// ponytail: Nomor 3 digit membatasi jumlah tiket sampai 999; perluas format token bila lebih.

const params = new URLSearchParams(window.location.search);
const qrFromUrl = params.get('qr') || '';
const isAdmin = params.has('admin');

function preference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function Notice({ children, type = 'info' }) {
  return children ? <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div> : null;
}

function GardenFlower({ className = '', pink = false }) {
  return <img className={className} src={`${import.meta.env.BASE_URL}garden-flower-${pink ? 'pink' : 'red'}.png`} width={pink ? 82 : 112} height={pink ? 83 : 109} alt="" aria-hidden="true" />;
}

function ParticipantPage({ info, infoError, infoLoading, reloadInfo }) {
  const [checkToken, setCheckToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flowersPaused, setFlowersPaused] = useState(false);
  const gardenRef = useRef(null);
  const resultRef = useRef(null);
  const qrValid = /^[a-f0-9]{64}$/i.test(qrFromUrl);

  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);
  useEffect(() => {
    const garden = gardenRef.current;
    if (!garden) return;
    const observer = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        target.classList.toggle('flower-offscreen', !isIntersecting);
      }
    });
    garden.querySelectorAll('.garden-branch, .garden-petals i, .card-flower-accent').forEach(flower => observer.observe(flower));
    const syncVisibility = () => { garden.dataset.pageHidden = String(document.hidden); };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!qrValid) return setError('Pindai QR pada tiket fisik Anda terlebih dahulu.');
    if (!/^2027\d{3}$/.test(checkToken)) return setError('Masukkan 7 digit token pada tiket, misalnya 2027052.');
    setLoading(true);
    setError('');
    try {
      setResult(await prizePoolRequest('verify', { checkToken, token: qrFromUrl }));
      reloadInfo();
    } catch (err) {
      setError(err.message || 'Tiket gagal diperiksa. Coba lagi.');
    } finally { setLoading(false); }
  }

  return (
    <main id="main-content" ref={gardenRef} className="participant-main" data-flowers-paused={flowersPaused}>
      <div className="garden-flowers" aria-hidden="true">
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
          <img key={corner} className={`garden-branch garden-${corner}`} src={`${import.meta.env.BASE_URL}garden-${corner}.png`} alt="" />
        ))}
        <div className="garden-petals">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
      </div>
      <div className="participant-container">
        <div className="event-heading">
          <img className="hero-logo" src={`${import.meta.env.BASE_URL}pt-nbsa-logo.png`} width="50" height="88" alt="PT NBSA" />
          <h1>Bloom & <em>Beyond</em></h1>
          <div className="heading-divider" aria-hidden="true"><span /><i /><i /><i /><span /></div>
          <p>{info?.title || 'NBSA Hidden Prize 2027'}</p>
        </div>
        <section className="card-ticket" aria-labelledby="ticket-title">
          <GardenFlower pink className="card-flower-accent" />
          {!result ? (
            <>
              <h2 id="ticket-title">Cek Tiket Hidden Prize</h2>
              <p className="card-instruction">Pindai QR pada tiket, lalu masukkan token untuk melihat hasil pilihan EO.</p>
              {!isConfigured ? (
                <Notice type="error">
                  <svg className="notice-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" /><path d="M12 6v7m0 3v2" stroke="white" strokeWidth="2" /></svg>
                  <span>Layanan belum terhubung. Hubungi panitia untuk mengaktifkan pengecekan tiket.</span>
                </Notice>
              ) : (
                <div className="session-status">
                  <p role="status">
                    {infoLoading ? 'Memuat status sesi…' : infoError ? 'Status sesi belum tersedia.' : info?.status === 'LIVE'
                      ? 'Sesi dibuka. Tiket Anda bisa diperiksa.' : info?.status === 'CLOSED'
                        ? 'Sesi pengecekan sudah ditutup.' : `Sesi belum dibuka. ${STATUS_NAMES[info?.status] || 'Menunggu panitia'}.`}
                  </p>
                  <button type="button" className="text-button" disabled={infoLoading} onClick={reloadInfo}>Perbarui status sesi</button>
                </div>
              )}
              <Notice type="error">{infoError}</Notice>
              <p id="qr-context" className="qr-context">{qrValid ? 'QR diterima dari tautan. Kecocokan tiket diperiksa saat dikirim.' : 'Buka halaman ini melalui QR pada tiket fisik Anda.'}</p>
              <form onSubmit={submit} className="participant-form" aria-busy={loading}>
                <div className="form-group">
                  <label htmlFor="check-token">Token pengecekan</label>
                  <div className="token-field">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="8" cy="18" r="5.5" /><path d="m12 14 13-12m-5 5 5 5m-9-1 4 4" /></svg>
                    <input id="check-token" className="input-field token-input" type="text" inputMode="numeric" pattern="2027[0-9]{3}" maxLength={7} autoComplete="off" required
                      aria-describedby="qr-context" value={checkToken} placeholder="Masukkan token pada tiket" onChange={e => setCheckToken(e.target.value.replace(/\D/g, '').slice(0, 7))} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={loading || !isConfigured || !qrValid || info?.status !== 'LIVE'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg>
                  {loading ? 'Memeriksa tiket…' : 'Periksa tiket saya'}
                </button>
              </form>
              <Notice type="error">{error}</Notice>
              <p className="ticket-footnote">Simpan tiket fisik Anda untuk ditunjukkan kepada panitia.</p>
            </>
          ) : (
            <div className="result-card">
              <h2 id="ticket-title" ref={resultRef} tabIndex={-1}>{result.eligible ? 'Tiket Anda terpilih' : 'Tiket Anda belum terpilih'}</h2>
              <p className="card-instruction">{result.eligible ? 'Anda berhak mengikuti Hidden Prize NBSA. Tunjukkan tiket fisik saat panitia memanggil nomor Anda.' : 'Yahh, Mohon Maaf Nomor anda tidak terpilih untuk mengikuti Hidden Prize NBSA. Sampai jumpa di acara berikutnya!'}</p>
              <dl className="ticket-identity">
                <div><dt>Nomor registrasi</dt><dd>{result.registrationNumber}</dd></div>
                <div><dt>Token pengecekan</dt><dd>{result.checkToken}</dd></div>
              </dl>
              {result.alreadyChecked && <p className="field-help">Tiket ini sudah pernah diperiksa. Hasilnya tetap sama.</p>}
              <button type="button" className="btn btn-outline" onClick={() => { setResult(null); setError(''); }}>Periksa ulang tiket ini</button>
            </div>
          )}
          <div className="ticket-ornament" aria-hidden="true"><span /><GardenFlower /><span /></div>
        </section>
      </div>
    </main>
  );
}

function AdminPage({ refreshPublicInfo }) {
  const [passwordInput, setPasswordInput] = useState('');
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [ticketCountInput, setTicketCountInput] = useState('65');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [companyName, setCompanyName] = useState(() => {
    const saved = preference('nb_company_name', '');
    return saved === 'PT NUSANTARA BAKTI SEJAHTERA' ? '' : saved.slice(0, 80);
  });
  const [logoDataUrl, setLogoDataUrl] = useState(() => preference('nb_logo_data', ''));
  const [logoSizePercent, setLogoSizePercent] = useState(() => {
    const saved = Number(preference('nb_logo_size', '16'));
    return Number.isFinite(saved) ? Math.max(10, Math.min(18, saved)) : 16;
  });
  const [badgeShape, setBadgeShape] = useState(() => preference('nb_badge_shape', 'circle') === 'square' ? 'square' : 'circle');
  const [previewQrSrc, setPreviewQrSrc] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const [logoLoading, setLogoLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [bulkProgress, setBulkProgress] = useState(0);
  const [modalCards, setModalCards] = useState([]);
  const printRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('nb_company_name', companyName);
      localStorage.setItem('nb_logo_size', String(logoSizePercent));
      localStorage.setItem('nb_badge_shape', badgeShape);
      if (logoDataUrl) localStorage.setItem('nb_logo_data', logoDataUrl);
      else localStorage.removeItem('nb_logo_data');
    } catch { /* Preferensi opsional. Ekspor tetap bekerja tanpa penyimpanan browser. */ }
  }, [companyName, logoSizePercent, badgeShape, logoDataUrl]);

  useEffect(() => {
    let canceled = false;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewQrSrc('');
    generateQrCanvas(participantUrl('0123456789abcdef'.repeat(4)), { size: 512, logoSrc: logoDataUrl, logoSizePercent, badgeShape })
      .then(canvas => { if (!canceled) setPreviewQrSrc(canvas.toDataURL('image/png')); })
      .catch(err => { if (!canceled) setPreviewError(err.message || 'Pratinjau gagal dibuat. Hapus atau unggah ulang logo.'); })
      .finally(() => { if (!canceled) setPreviewLoading(false); });
    return () => { canceled = true; };
  }, [logoDataUrl, logoSizePercent, badgeShape]);

  useEffect(() => {
    if (!modalCards.length) return;
    const dialog = printRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [modalCards]);

  const qrOptions = { size: 1024, logoSrc: logoDataUrl, logoSizePercent, badgeShape };
  const brandingOptions = { companyName: companyName.trim(), eventTitle: 'NBSA Hidden Prize 2027', eventSubtitle: 'Bloom & Beyond' };
  const exportDisabled = busy || !!exporting || logoLoading || previewLoading || !!previewError;
  const ticketCount = data?.maxParticipants ?? 65;
  const ticketsReady = data?.total === ticketCount && data?.tickets?.length === ticketCount;
  const lastNumber = String(ticketCount).padStart(3, '0');
  const sessionDisabled = busy || !!exporting;

  const send = useCallback(async (action, args = {}, pass = password) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await prizePoolRequest(action, args, pass);
      setData(response);
      setTicketCountInput(String(response.maxParticipants ?? 65));
      refreshPublicInfo();
      return response;
    } catch (err) {
      setError(err.message || 'Permintaan gagal. Coba lagi.');
      throw err;
    } finally { setBusy(false); }
  }, [password, refreshPublicInfo]);

  async function login(event) {
    event.preventDefault();
    try {
      await send('adminStats', {}, passwordInput);
      setPassword(passwordInput);
      setPasswordInput('');
    } catch { /* Pesan berasal dari send. */ }
  }

  async function execute(action, question, message, args = {}) {
    if (!window.confirm(question)) return;
    try { await send(action, args); setSuccess(message); } catch { /* Pesan berasal dari send. */ }
  }

  async function generateTickets(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    let count;
    try { count = validateTicketCount(ticketCountInput); }
    catch (err) { setError(err.message); return; }
    await execute('adminGenerateTickets',
      `Buat ${count} tiket sekarang? Jumlah dan QR tidak dapat diubah setelah dibuat.`,
      `${count} tiket disiapkan. Jumlah tiket terkunci.`, { ticketCount: count });
  }

  function downloadTemplate() {
    try {
      downloadText('template_EO_prizepool_2027.csv', buildEoCsv(data?.tickets, ticketCount));
      setSuccess(`CSV EO disiapkan (${data?.tickets?.length || ticketCount} tiket). Isi tepat 8 TRUE, sisanya FALSE.`);
      setError('');
    } catch (err) { setError(err.message); }
  }

  async function importEo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error(`CSV terlalu besar. Batas 2 MB untuk ${ticketCount} baris tiket.`);
      const rows = parseEoCsv(await file.text(), ticketCount);
      if (!window.confirm(`CSV valid: tepat 8 TRUE dari ${ticketCount} tiket. Impor dan kunci hasil permanen? Tindakan ini tidak dapat diulang.`)) return;
      await send('adminImportResults', { results: rows });
      setSuccess('Hasil EO dikunci. Sesi pengecekan belum dibuka.');
    } catch (err) { setError(err.message || 'CSV gagal diimpor. Periksa isi berkas.'); }
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    setLogoLoading(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Pilih logo PNG, JPG, atau WebP.');
      if (!file.size || file.size > 2 * 1024 * 1024) throw new Error('Ukuran logo harus 1 byte sampai 2 MB.');
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Berkas logo gagal dibaca. Coba unggah ulang.'));
        reader.onabort = () => reject(new Error('Pembacaan logo dibatalkan.'));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = source;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('Dimensi logo maksimal 4096 × 4096 piksel.');
      setLogoDataUrl(source);
      setSuccess('Logo dimuat. Uji pindai hasil cetak sebelum mencetak seluruh tiket.');
    } catch (err) { setError(err.message || 'Logo gagal dibaca. Pilih gambar lain.'); }
    finally { setLogoLoading(false); }
  }

  async function handleBulkDownloadZip() {
    setExporting('zip');
    setBulkProgress(0);
    setError('');
    setSuccess('');
    try {
      const blob = await bulkGenerateTicketsZip(
        data?.tickets,
        participantUrl,
        qrOptions,
        brandingOptions,
        current => setBulkProgress(current),
        ticketCount
      );
      downloadBlob(blob, `Tiket_GardenBloom_${ticketCount}_JPG.zip`);
      setSuccess(`ZIP siap: ${ticketCount} berkas JPG individual, masing-masing 1440 × 2080 piksel.`);
    } catch (err) { setError(`Ekspor dibatalkan. ${err.message}`); }
    finally { setExporting(''); }
  }

  async function downloadSingleCardJpg(ticket) {
    setExporting(ticket.registrationNumber);
    setError('');
    setSuccess('');
    try {
      const qr = await generateQrCanvas(participantUrl(ticket.token), qrOptions);
      const canvas = await renderTicketCardToCanvas(ticket, qr, brandingOptions);
      downloadBlob(await canvasToJpegBlob(canvas, 0.95), `Tiket_GardenBloom_${ticket.registrationNumber}.jpg`);
      setSuccess(`JPG tiket ${ticket.registrationNumber} siap diunduh.`);
    } catch (err) { setError(`JPG gagal dibuat. ${err.message}`); }
    finally { setExporting(''); }
  }

  async function openPrintPreview() {
    try {
      validateTicketSet(data?.tickets, ticketCount);
    } catch (err) {
      return setError(`Tiket belum lengkap untuk dicetak. ${err.message}`);
    }
    setExporting('print');
    setError('');
    setSuccess('');
    try {
      const cards = [];
      for (const ticket of data.tickets) {
        const canvas = await generateQrCanvas(participantUrl(ticket.token), qrOptions);
        cards.push({ ...ticket, src: canvas.toDataURL('image/png') });
      }
      setModalCards(cards);
    } catch (err) { setError(`Pratinjau cetak gagal. ${err.message}`); }
    finally { setExporting(''); }
  }

  const filtered = useMemo(() => data?.tickets?.filter(ticket => `${ticket.registrationNumber} ${ticket.checkToken}`.includes(search.trim())) || [], [data, search]);

  return (
    <main id="main-content" className="admin-main">
      <div className="garden-flowers" aria-hidden="true">
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
          <img key={corner} className={`garden-branch garden-${corner}`} src={`${import.meta.env.BASE_URL}garden-${corner}.png`} alt="" />
        ))}
      </div>
      <div className={`container admin-container${password ? '' : ' admin-login-container'}`}>
      <header className="event-heading admin-header">
        <h1>Bloom & <em>Beyond</em></h1>
        <div className="heading-divider" aria-hidden="true"><span /><i /><i /><i /><span /></div>
        <p>Panitia Hidden Prize · NBSA Hidden Prize 2027</p>
      </header>
      {!isConfigured && <Notice type="error">Backend belum terhubung. Atur VITE_GAS_URL dengan URL deployment Google Apps Script.</Notice>}
      {!password ? (
        <section className="admin-login card-ticket" aria-labelledby="login-title">
          <GardenFlower pink className="card-flower-accent" />
          <h2 id="login-title">Masuk panitia</h2><p className="card-instruction">Gunakan password admin yang diatur melalui Google Spreadsheet acara.</p>
          <form onSubmit={login} className="participant-form">
            <div className="form-group"><label htmlFor="admin-password">Password admin</label><input id="admin-password" className="input-field" type="password" autoComplete="current-password" required value={passwordInput} onChange={e => setPasswordInput(e.target.value)} /></div>
            <button type="submit" className="btn btn-primary btn-full" disabled={busy || !isConfigured}>{busy ? 'Memverifikasi…' : 'Masuk'}</button>
          </form>
          <Notice type="error">{error}</Notice>
          <div className="ticket-ornament" aria-hidden="true"><span /><GardenFlower /><span /></div>
        </section>
      ) : (
        <>
          <div className="admin-top-bar">
            <p role="status">Status sesi: <strong>{STATUS_NAMES[data?.status] || data?.status}</strong></p>
            <div className="button-row">
              <button type="button" className="btn btn-outline" disabled={busy || !!exporting} onClick={() => send('adminStats').catch(() => {})}>{busy ? 'Memuat…' : 'Segarkan data'}</button>
              <button type="button" className="text-button" disabled={busy || !!exporting} onClick={() => { setPassword(''); setData(null); setShowResults(false); setError(''); setSuccess(''); }}>Keluar</button>
            </div>
          </div>
          <Notice type="error">{error}</Notice><Notice type="success">{success}</Notice>
          <dl className="stats-grid" aria-label="Jumlah tiket">
            <div><dt>Tiket tersedia</dt><dd>{data?.total ?? 0}<span> / {ticketCount}</span></dd></div>
            <div><dt>Terpilih EO</dt><dd>{data?.selected ?? 0}<span> / 8</span></dd></div>
            <div><dt>Sudah diperiksa</dt><dd>{data?.checked ?? 0}<span> / {ticketCount}</span></dd></div>
          </dl>
          <section className="panel" aria-labelledby="studio-title">
            <div className="section-heading"><h2 id="studio-title">Studio tiket</h2><p>Tambahkan logo perusahaan, lalu unduh JPG atau cetak lembar A4.</p></div>
            <div className="qr-studio-grid">
              <fieldset className="studio-controls" disabled={busy || !!exporting || logoLoading}>
                <legend className="sr-only">Pengaturan logo dan ekspor</legend>
                <div className="form-group"><label htmlFor="company-name">Nama perusahaan <span className="optional">(opsional)</span></label><input id="company-name" className="input-field" type="text" maxLength={80} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nama yang dicetak pada tiket" /></div>
                <div className="form-group">
                  <label htmlFor="logo-upload">Logo di tengah QR</label>
                  <input id="logo-upload" className="file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-help" onChange={handleLogoUpload} />
                  <p id="logo-help" className="field-help">PNG, JPG, atau WebP. Maksimal 2 MB dan 4096 × 4096 piksel.</p>
                  {logoLoading && <p role="status">Membaca logo…</p>}
                  {logoDataUrl && <button type="button" className="text-button reset-logo" onClick={() => { setLogoDataUrl(''); setSuccess('Logo dihapus. QR dicetak tanpa logo.'); }}>Hapus logo</button>}
                </div>
                <div className="form-group">
                  <label htmlFor="logo-size">Ukuran logo: <output htmlFor="logo-size">{logoSizePercent}%</output></label>
                  <input id="logo-size" className="range-input" type="range" min="10" max="18" step="1" value={logoSizePercent} onChange={e => setLogoSizePercent(Number(e.target.value))} aria-describedby="size-help" />
                  <p id="size-help" className="field-help">10–18% dari lebar pola QR. Gunakan ukuran kecil untuk menjaga keterbacaan.</p>
                </div>
                <fieldset className="shape-options"><legend>Bentuk latar logo</legend>
                  <label><input type="radio" name="logo-shape" value="circle" checked={badgeShape === 'circle'} onChange={() => setBadgeShape('circle')} /> Lingkaran</label>
                  <label><input type="radio" name="logo-shape" value="square" checked={badgeShape === 'square'} onChange={() => setBadgeShape('square')} /> Kotak membulat</label>
                </fieldset>
                <div className="button-row export-actions">
                  <button type="button" className="btn btn-primary" disabled={!ticketsReady || exportDisabled} onClick={handleBulkDownloadZip}>{exporting === 'zip' ? 'Membuat ZIP…' : `Unduh ${ticketCount} JPG (.zip)`}</button>
                  <button type="button" className="btn btn-outline" disabled={!ticketsReady || exportDisabled} onClick={openPrintPreview}>{exporting === 'print' ? 'Menyiapkan cetak…' : 'Pratinjau cetak A4'}</button>
                </div>
                {exporting === 'zip' && <div className="export-progress"><label htmlFor="bulk-progress">Membuat JPG: {bulkProgress} / {ticketCount}</label><progress id="bulk-progress" max={ticketCount} value={bulkProgress} /></div>}
              </fieldset>
              <figure className="studio-preview">
                <div className="qr-preview-image" aria-busy={previewLoading}>
                  {previewQrSrc ? <img src={previewQrSrc} alt="Pratinjau desain QR dengan pengaturan logo saat ini, bukan tiket peserta" /> : <p role="status">{previewLoading ? 'Menyiapkan QR…' : 'Pratinjau tidak tersedia'}</p>}
                </div>
                <figcaption>Pratinjau desain, bukan tiket peserta.<br />Koreksi QR level H. Uji pindai hasil cetak dengan logo Anda sebelum mencetak semua tiket.</figcaption>
                <Notice type="error">{previewError}</Notice>
              </figure>
            </div>
          </section>
          <section className="panel" aria-labelledby="flow-title">
            <div className="section-heading"><h2 id="flow-title">Pengaturan sesi</h2><p>Hasil EO diimpor sekali. Pembukaan dan penutupan sesi tetap dikendalikan panitia.</p></div>
            {data?.status !== 'DRAFT' && <p className="field-help">Jumlah terkunci: {ticketCount} tiket. Nomor 001–{lastNumber}, token 2027001–2027{lastNumber}.</p>}
            <div className="session-actions">
              {data?.status === 'DRAFT' && <div>
                <h3>Siapkan tiket</h3>
                <form onSubmit={generateTickets}>
                  <div className="form-group">
                    <label htmlFor="ticket-count">Jumlah tiket</label>
                    <input id="ticket-count" className="input-field" type="number" min="8" max="999" step="1" required value={ticketCountInput} onChange={e => setTicketCountInput(e.target.value)} disabled={sessionDisabled} aria-describedby="ticket-count-help" />
                    <p id="ticket-count-help" className="field-help">8–999 tiket dengan nomor 3 digit. EO tetap memilih tepat 8 TRUE. Jumlah dan QR tidak dapat diubah setelah dibuat.</p>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={sessionDisabled}>{busy ? 'Menyiapkan…' : 'Buat tiket'}</button>
                </form>
              </div>}
              {ticketsReady && <div><h3>Format hasil EO</h3><p>EO mengisi tepat 8 TRUE dari {ticketCount} baris, sisanya FALSE. Buka CSV di Excel bila perlu, lalu simpan hasil akhir sebagai CSV.</p><div className="button-row"><button type="button" className="btn btn-outline" disabled={sessionDisabled} onClick={downloadTemplate}>Unduh CSV EO</button>{ticketCount === 65 && <a className="btn btn-outline" href={`${import.meta.env.BASE_URL}Template_EO_PrizePool_2027.xlsx`} download>Unduh Excel (65 tiket)</a>}</div></div>}
              {data?.status === 'TICKETS_READY' && <div><h3>Impor dan kunci hasil</h3><p>Periksa kembali berkas EO. Hasil yang sudah diimpor tidak dapat diganti.</p><label htmlFor="eo-csv">CSV hasil EO</label><input id="eo-csv" className="file-input" type="file" accept=".csv,text/csv" disabled={busy || !!exporting} onChange={importEo} /></div>}
              {data?.status === 'IMPORTING' && <div><h3>Impor sedang diproses</h3><p>Tunggu hingga selesai, lalu segarkan data. Jangan mengimpor ulang.</p></div>}
              {data?.status === 'LOCKED' && <div><h3>Buka pengecekan peserta</h3><p>8 tiket terpilih sudah dikunci. Buka sesi setelah MC memberi aba-aba.</p><button type="button" className="btn btn-primary" disabled={busy || !!exporting} onClick={() => execute('adminGoLive', 'Buka pengecekan hasil untuk seluruh peserta sekarang?', 'Sesi dibuka. Peserta dapat memeriksa tiket.')}>Buka sesi pengecekan</button></div>}
              {data?.status === 'LIVE' && <div><h3>Tutup sesi</h3><p>Peserta tidak dapat memeriksa tiket setelah sesi ditutup. Sesi tidak bisa dibuka kembali.</p><button type="button" className="btn btn-danger" disabled={busy || !!exporting} onClick={() => execute('adminClose', 'Tutup sesi pengecekan? Sesi tidak dapat dibuka kembali.', 'Sesi pengecekan ditutup.')}>Tutup sesi pengecekan</button></div>}
              {data?.status === 'CLOSED' && <div><h3>Sesi selesai</h3><p>Pengecekan peserta ditutup. Data tiket dan hasil EO tetap tersimpan.</p></div>}
            </div>
          </section>
          <section className="panel" aria-labelledby="tickets-title">
            <div className="section-heading table-heading"><div><h2 id="tickets-title">Daftar tiket</h2><p>Tiket memakai nomor, tanpa nama karyawan.</p></div><button type="button" className="text-button" aria-pressed={showResults} onClick={() => setShowResults(value => !value)}>{showResults ? 'Sembunyikan hasil EO' : 'Tampilkan hasil EO'}</button></div>
            <div className="table-toolbar"><div className="search-field"><label htmlFor="ticket-search">Cari nomor atau token</label><input id="ticket-search" className="input-field" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="052 atau 2027052" /></div><p className="field-help" role="status">{filtered.length} dari {data?.tickets?.length || 0} tiket</p></div>
            <div className="table-scroll" role="region" aria-label="Daftar tiket peserta, geser untuk melihat seluruh kolom" tabIndex={0}>
              <table><caption className="sr-only">Nomor registrasi, token pengecekan, status pengecekan, dan hasil EO</caption><thead><tr><th scope="col">Nomor</th><th scope="col">Token</th><th scope="col">Pengecekan</th><th scope="col">Hasil EO</th><th scope="col">Unduh</th></tr></thead><tbody>
                {filtered.map(ticket => <tr key={ticket.registrationNumber}><th scope="row">{ticket.registrationNumber}</th><td className="tabular">{ticket.checkToken}</td><td>{ticket.checkedAt ? 'Sudah diperiksa' : 'Belum diperiksa'}</td><td>{showResults && ['LOCKED', 'LIVE', 'CLOSED'].includes(data.status) ? ticket.eligible ? 'Terpilih (TRUE)' : 'Tidak terpilih (FALSE)' : 'Disembunyikan'}</td><td><button type="button" className="btn btn-outline row-download" disabled={exportDisabled} onClick={() => downloadSingleCardJpg(ticket)} aria-label={`Unduh JPG tiket ${ticket.registrationNumber}`}>{exporting === ticket.registrationNumber ? 'Membuat…' : 'JPG'}</button></td></tr>)}
                {!filtered.length && <tr><td colSpan={5}>Tidak ada tiket yang cocok.</td></tr>}
              </tbody></table>
            </div>
            {data?.lockedAt && <p className="field-help lock-time">Hasil EO dikunci: {formatDatetime(data.lockedAt)}</p>}
          </section>
          <dialog ref={printRef} className="print-dialog" aria-labelledby="print-title" onCancel={() => setModalCards([])} onClose={() => setModalCards([])}>
            <div className="print-toolbar"><div><h2 id="print-title">Cetak {modalCards.length} tiket</h2><p>A4 potret, 4 tiket per lembar. Skala 100%, tanpa header/footer browser.</p></div><div className="button-row"><button type="button" className="btn btn-primary" onClick={() => window.print()}>Cetak A4</button><button type="button" className="btn btn-outline" autoFocus onClick={() => setModalCards([])}>Tutup pratinjau</button></div></div>
            <div className="print-pages">
              {Array.from({ length: Math.ceil(modalCards.length / 4) }, (_, page) => <div className="ticket-print-page" key={page}>
                {modalCards.slice(page * 4, page * 4 + 4).map(ticket => <article className="print-ticket" key={ticket.registrationNumber}>
                  {companyName.trim() && <p className="print-company">{companyName.trim()}</p>}
                  <p className="print-event">NBSA Hidden Prize</p><h3> Bloom & Beyond</h3>
                  <img src={ticket.src} className="print-qr" alt={`QR tiket ${ticket.registrationNumber}`} />
                  <p className="print-registration">No. {ticket.registrationNumber}</p><p className="print-token">Token {ticket.checkToken}</p>
                  <p className="print-instruction">Pindai QR, lalu masukkan token.<br />Simpan tiket hingga sesi selesai.</p>
                </article>)}
              </div>)}
            </div>
          </dialog>
        </>
      )}
      </div>
    </main>
  );
}

export default function App() {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [infoLoading, setInfoLoading] = useState(isConfigured);
  const reloadInfo = useCallback(async () => {
    if (!isConfigured) return;
    setInfoLoading(true);
    try { setInfo(await prizePoolRequest('publicInfo')); setInfoError(''); }
    catch (err) { setInfoError(err.message || 'Status gagal dimuat. Perbarui status untuk mencoba lagi.'); }
    finally { setInfoLoading(false); }
  }, []);
  useEffect(() => { reloadInfo(); }, [reloadInfo]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Lewati ke konten</a>
      {isAdmin && (
        <header className="topbar">
          <div className="container topbar-brand">
            <img src={`${import.meta.env.BASE_URL}pt-nbsa-logo.png`} width="48" height="48" alt="" />
            <div><strong>NBSA</strong><span> Bloom & Beyond</span></div>
          </div>
        </header>
      )}
      {isAdmin ? <AdminPage refreshPublicInfo={reloadInfo} /> : <ParticipantPage info={info} infoError={infoError} infoLoading={infoLoading} reloadInfo={reloadInfo} />}
      <footer className="site-footer">
        <span>NBSA Hidden Prize 2027 <span aria-hidden="true">·</span> Bloom & Beyond</span>
      </footer>
    </div>
  );
}
