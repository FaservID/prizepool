import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isConfigured, participantUrl, prizePoolRequest } from './api.js';
import { STATUS_NAMES, buildEoCsv, downloadText, formatDatetime, parseEoCsv } from './utils.js';

const queryParams = new URLSearchParams(window.location.search);
const qrFromUrl = queryParams.get('qr') || '';
const initialView = queryParams.has('admin') ? 'admin' : 'participant';

function Icon({ name, size = 22 }) {
  const props = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round' };
  const paths = {
    gift:<><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8s-7-1-7-4a2.5 2.5 0 0 1 5 0zM12 8s7-1 7-4a2.5 2.5 0 0 0-5 0z"/></>,
    qr:<><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><path d="M14 14h3v3h-3M20 14h2v2h-2M14 20h2m3-1h3v3"/></>,
    lock:<><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    sparkle:<><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/></>,
    refresh:<><path d="M3 11a9 9 0 0 1 15.5-6L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.5 6L3 17m0 4v-4h4"/></>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    settings:<><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2M18.4 5.6l-2.2 2.2m-8.4 8.4-2.2 2.2"/><circle cx="12" cy="12" r="3.5"/></>,
    eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    print:<><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5h-2M6 14h12v7H6z"/></>,
    file:<><path d="M4 2h11l5 5v15H4zM14 2v6h6M7 12h10M7 16h10"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  };
  return <svg {...props} aria-hidden="true">{paths[name] || paths.gift}</svg>;
}
function Button({children,icon,variant='primary',onClick,disabled,type='button',className=''}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant} ${className}`}>{icon && <Icon name={icon} size={18}/>} {children}</button>;
}
function Notice({children,type='info'}) {
  return children ? <div className={`notice notice-${type}`} role={type==='error'?'alert':'status'}>{children}</div> : null;
}
function PageHeader({view,setView}) {
  return <header className="topbar"><div className="container topbar-content">
    <div className="brand"><div className="brand-icon"><Icon name="gift"/></div><div><strong>NBSA</strong><span>PRIZE POOL 2027</span></div></div>
    <nav className="nav-tabs"><button className={view==='participant'?'active':''} onClick={()=>setView('participant')}>Peserta</button>
      <button className={view==='admin'?'active':''} onClick={()=>setView('admin')}>Dashboard Admin</button></nav>
  </div></header>;
}
function ParticipantPage({info,reloadInfo}) {
  const [checkToken,setCheckToken] = useState('');
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const qrValid = /^[a-f0-9]{64}$/i.test(qrFromUrl);
  async function submit(event) {
    event.preventDefault();
    if (!qrValid) {setError('Silakan scan QR asli pada tiket yang dibagikan panitia.');return;}
    if (!/^2027\d{3}$/.test(checkToken)) {setError('Token harus berformat 2027XXX, contoh: 2027052.');return;}
    setLoading(true); setError(''); setResult(null);
    try { const data = await prizePoolRequest('verify',{checkToken,token:qrFromUrl}); setResult(data); reloadInfo(); }
    catch(e) {setError(e.message);} finally {setLoading(false);}
  }
  return <>
    <section className="hero participant-hero"><div className="small-orb orb-one"/><div className="small-orb orb-two"/><div className="container hero-content">
      <div className="eyebrow"><span className="eyebrow-dot"/> LUCKY TICKET 2027</div><h1>{info?.title || 'NBSA Prize Pool 2027'}</h1>
      <p>Scan QR pada tiket registrasimu, masukkan token 2027 + nomor tiga digit, lalu cek hasil Prize Pool.</p>
      <div className="hero-pills"><span>✦ 65 Nomor Registrasi</span><span>★ 8 Berhak Ikut Prize Pool</span></div>
    </div></section>
    <main className="main container participant-content">
      {!isConfigured && <Notice type="error">URL Google Apps Script belum dikonfigurasi.</Notice>}
      {isConfigured && info?.status!=='LIVE' && <Notice>Sesi Prize Pool belum dibuka. Status: <b>{STATUS_NAMES[info?.status]||'Memuat...'}</b>. Simpan tiketmu sampai sesi dimulai.</Notice>}
      <div className="participation-card">{!result ? <>
        <div className="center-icon"><Icon name="qr" size={35}/></div>
        <div className="card-heading">Cek Tiket Prize Pool</div>
        <p className="muted center">Contoh: registrasi <b>052</b> → masukkan <b>2027052</b>.</p>
        <div className={`qr-indicator ${qrValid?'qr-good':'qr-missing'}`}><Icon name={qrValid?'check':'qr'} size={17}/>
          {qrValid?'QR tiket asli terdeteksi':'QR belum terdeteksi — buka melalui scan tiket'}
        </div>
        <form onSubmit={submit} className="participant-form"><label htmlFor="check-token">Token pengecekan (7 digit)</label>
          <input id="check-token" type="text" inputMode="numeric" pattern="2027[0-9]{3}" maxLength={7} autoComplete="off" value={checkToken}
            onChange={e=>setCheckToken(e.target.value.replace(/\D/g,'').slice(0,7))} placeholder="2027052" required/>
          <Button type="submit" className="full" icon="arrow" disabled={loading||!isConfigured||!qrValid||info?.status!=='LIVE'}>{loading?'Memeriksa...':'Cek Hasil Saya'}</Button>
        </form>
        <Notice type="error">{error}</Notice>
        <p className="privacy-note">Nomor registrasi dan QR harus sesuai. Hasil ditetapkan EO dan tidak berubah saat scan ulang.</p>
      </> : <div className="result-wrap">
        <div className={`result-circle ${result.eligible?'win':'lose'}`}><Icon name={result.eligible?'sparkle':'gift'} size={42}/></div>
        <div className="result-kicker">{result.eligible?'SELAMAT!':'TERIMA KASIH!'}</div>
        <h2>{result.eligible?'Anda Berhak Mengikuti Prize Pool!':'Anda Belum Beruntung'}</h2>
        <p className="result-description">{result.eligible?'Nomor tiketmu terpilih oleh EO. Simpan tiket fisik untuk validasi panitia.':'Terima kasih telah berpartisipasi dalam NBSA Prize Pool 2027.'}</p>
        <div className="identity"><b>REGISTRASI {result.registrationNumber}</b><span>TOKEN {result.checkToken}</span></div>
        {result.alreadyChecked && <p className="subtle-note">Ini pengecekan ulang. Status tiket tetap sama.</p>}
        <Button variant="secondary" icon="refresh" onClick={()=>{setResult(null);setError('')}}>Kembali ke Form</Button>
      </div>}</div>
      <div className="footer-hint">1 karyawan menerima 1 tiket • Tidak perlu memasukkan nama • Hasil dipilih EO</div>
    </main>
  </>;
}
function StatCard({label,value,sub,icon}) {return <div className="stat-card"><div className="stat-head"><span>{label}</span><Icon name={icon} size={20}/></div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></div>}

function AdminPage({refreshPublicInfo}) {
  const [passwordInput,setPasswordInput] = useState('');
  const [password,setPassword] = useState('');
  const [data,setData] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [search,setSearch] = useState('');
  const [showResults,setShowResults] = useState(false);
  const [printCards,setPrintCards] = useState(null);
  const [printBusy,setPrintBusy] = useState(false);
  const send = useCallback(async(action,args={},pass=password)=>{
    setBusy(true);setError('');setSuccess('');
    try {const v=await prizePoolRequest(action,args,pass);setData(v);refreshPublicInfo();return v;}
    catch(e){setError(e.message);throw e;}finally{setBusy(false);}
  },[password,refreshPublicInfo]);
  async function login(e){e.preventDefault();try{await send('adminStats',{},passwordInput);setPassword(passwordInput);setPasswordInput('');}catch{/* pesan terlihat */}}
  async function execute(action,question,message,args={}){
    if(question&&!window.confirm(question))return;
    try{await send(action,args);setSuccess(message);}catch{/* pesan terlihat */}
  }
  function downloadTemplate(){
    try{downloadText('template_EO_prizepool_2027.csv',buildEoCsv(data?.tickets));setSuccess('Template CSV berhasil disiapkan untuk EO. Pilih tepat 8 TRUE, sisanya FALSE.');setError('');}
    catch(e){setError(e.message);}
  }
  async function importEo(e){
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    try{
      const rows=parseEoCsv(await f.text());
      if(!window.confirm(`File valid: ${rows.filter(x=>x.selected).length} TRUE dari 65. Import hasil EO dan KUNCI permanen?`))return;
      await send('adminImportResults',{results:rows});setSuccess('File EO berhasil diimpor. Tepat 8 TRUE, hasil dikunci.');
    }catch(err){setError(err.message);}
  }
  const filtered=useMemo(()=>data?.tickets?.filter(x=>`${x.registrationNumber} ${x.checkToken}`.includes(search))||[],[data,search]);
  async function printQr(){
    if(data?.tickets?.length!==65)return;setPrintBusy(true);setError('');
    try{
      const module=await import('qrcode');const qr=module.default||module;
      const cards=await Promise.all(data.tickets.map(async t=>({
        ...t,src:await qr.toDataURL(participantUrl(t.token),{errorCorrectionLevel:'M',margin:1,width:240}),
      })));
      setPrintCards(cards);window.setTimeout(()=>window.print(),400);
    }catch(e){setError('Tidak dapat membuat QR: '+e.message);}finally{setPrintBusy(false);}
  }
  return <main className="container admin-main">
    <div className="page-intro"><div className="eyebrow dark-eyebrow">EVENT CONTROL</div><h1>Dashboard Admin</h1>
      <p>H-1 cetak tiket • hari H bagikan • EO impor 8 TRUE • aktifkan hasil saat Prize Pool.</p></div>
    {!isConfigured&&<Notice type="error">GitHub variable VITE_GAS_URL belum diatur.</Notice>}
    {!password?<div className="admin-login panel"><div className="center-icon"><Icon name="lock" size={29}/></div><h2>Login Admin</h2>
      <p className="muted center">Password diatur melalui menu Prize Pool pada Google Spreadsheet.</p>
      <form onSubmit={login}><label htmlFor="admin-password">Password Admin</label>
        <input id="admin-password" type="password" autoComplete="current-password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Masukkan password" required/>
        <Button type="submit" className="full" disabled={busy||!isConfigured}>{busy?'Memeriksa...':'Masuk Dashboard'}</Button></form><Notice type="error">{error}</Notice>
    </div>:<>
      <div className="admin-top"><div className={`status-chip chip-${(data?.status||'DRAFT').toLowerCase()}`}><span className="status-dot"/>{STATUS_NAMES[data?.status]||data?.status}</div>
        <div className="admin-top-actions"><Button variant="secondary" icon="refresh" disabled={busy} onClick={()=>send('adminStats').catch(()=>{})}>Refresh</Button>
          <Button variant="ghost" icon="lock" onClick={()=>{setPassword('');setData(null);setShowResults(false)}}>Keluar</Button></div></div>
      <Notice type="error">{error}</Notice><Notice type="success">{success}</Notice>
      <section className="stat-grid">
        <StatCard label="Tiket Digenerate" value={data?.total??0} sub="Maksimal 65 tiket" icon="qr"/>
        <StatCard label="TRUE oleh EO" value={data?.selected??0} sub="Harus tepat 8" icon="sparkle"/>
        <StatCard label="Sudah Cek Hasil" value={data?.checked??0} sub="Nomor unik yang sudah scan" icon="users"/>
      </section>
      <section className="panel action-panel"><div className="section-title"><div><h2>Kontrol Acara</h2><p className="muted">Generate QR → Cetak → Unduh CSV EO → Import EO → LIVE</p></div><Icon name="settings" size={24}/></div>
        <div className="action-grid">
          {data?.status==='DRAFT'&&<div className="action-card important"><h3>1. Generate 65 Tiket</h3><p>Buat 65 nomor 001–065, token pengecekan 2027001–2027065, dan QR rahasia. Tidak menentukan 8 TRUE.</p>
            <Button icon="qr" disabled={busy} onClick={()=>execute('adminGenerateTickets','Buat 65 tiket permanen sekarang? QR tidak bisa digenerate ulang tanpa spreadsheet baru.','65 tiket siap dicetak.')}>Generate 65 Tiket</Button></div>}
          {data?.total===65&&<div className="action-card"><h3>2. Cetak 65 QR</h3><p>H-1 cetak tiket A4 bernomor 001 sampai 065. Bagikan satu tiket ke satu karyawan saat registrasi.</p>
            <Button variant="outline" icon="print" disabled={printBusy||busy} onClick={printQr}>{printBusy?'Membuat QR...':'Cetak Semua Tiket'}</Button></div>}
          {data?.total===65&&<div className="action-card"><h3>3. Unduh Format EO</h3><p>65 baris: nomor_registrasi, token_pengecekan, terpilih. Semua FALSE saat awal, EO ubah tepat 8 TRUE.</p>
            <div className="button-stack"><Button variant="outline" icon="file" disabled={busy} onClick={downloadTemplate}>Download CSV EO</Button>
            <a className="button button-secondary" href={`${import.meta.env.BASE_URL}Template_EO_PrizePool_2027.xlsx`} download="Template_EO_PrizePool_2027.xlsx"><Icon name="file" size={18}/> Download Excel</a></div></div>}
          {data?.status==='TICKETS_READY'&&<div className="action-card important"><h3>4. Import Hasil EO</h3><p>Hanya CSV berisi 65 baris dengan tepat 8 TRUE diterima. Hasil dikunci setelah import.</p>
            <label className={`button button-outline ${busy?'disabled':''}`}><Icon name="upload" size={17}/> Upload CSV EO<input hidden type="file" accept=".csv,text/csv" disabled={busy} onChange={importEo}/></label></div>}
          {data?.status==='LOCKED'&&<div className="action-card important"><h3>5. Mulai Sesi Prize Pool</h3><p>Hasil EO sudah tersimpan, tapi belum terlihat oleh karyawan. Buka scan saat MC memberi aba-aba.</p>
            <Button icon="check" disabled={busy} onClick={()=>execute('adminGoLive','Buka hasil Prize Pool sekarang untuk semua pemegang QR?','Prize Pool LIVE, hasil sudah dapat dicek.')}>Aktifkan Prize Pool</Button></div>}
          {data?.status==='LIVE'&&<div className="action-card"><h3>6. Selesai</h3><p>Tutup akses pengecekan hasil setelah sesi berakhir.</p>
            <Button variant="danger" disabled={busy} onClick={()=>execute('adminClose','Tutup sesi pengecekan hasil?','Sesi Prize Pool ditutup.')}>Tutup Sesi</Button></div>}
        </div>
        <div className="admin-footnote"><Icon name="lock" size={15}/> File EO tidak berisi QR rahasia. Hasil 8 TRUE hanya bisa diimpor sekali dan tidak dapat diacak ulang.</div>
      </section>
      <section className="panel participants-panel"><div className="section-title"><div><h2>65 Nomor Registrasi</h2><p className="muted">Tidak ada nama; tiket dibagikan acak saat registrasi.</p></div>
        <div className="table-controls"><button className="small-button" onClick={()=>setShowResults(v=>!v)}><Icon name="eye" size={15}/>{showResults?'Sembunyikan Hasil':'Lihat Status EO'}</button></div></div>
        <input className="search-field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari 001 atau 2027052..." aria-label="Cari nomor tiket"/>
        <div className="table-scroll"><table><thead><tr><th>Nomor Reg.</th><th>Token Pengecekan</th><th>Sudah Cek?</th><th>Hasil EO</th></tr></thead><tbody>
          {filtered.map(t=><tr key={t.registrationNumber}><td><b>{t.registrationNumber}</b></td><td>{t.checkToken}</td>
            <td><span className={`table-tag ${t.checkedAt?'tag-checked':''}`}>{t.checkedAt?'Sudah':'Belum'}</span></td>
            <td>{showResults&&['LOCKED','LIVE','CLOSED'].includes(data.status)
              ? <span className={`table-tag ${t.eligible?'tag-winner':''}`}>{t.eligible?'TRUE':'FALSE'}</span>:'••••'}</td></tr>)}
        </tbody></table>{filtered.length===0&&<div className="table-empty">Belum ada tiket atau pencarian tidak cocok.</div>}</div>
        {data?.lockedAt&&<div className="locked-at">Hasil EO dikunci: {formatDatetime(data.lockedAt)}</div>}
      </section>
    </>}
    {printCards&&<div className="qr-print-overlay"><div className="qr-print-toolbar"><b>Preview cetak {printCards.length} tiket</b><span>Pastikan nomor registrasi dan QR terbaca jelas.</span>
      <Button variant="secondary" onClick={()=>setPrintCards(null)}>Tutup Preview</Button></div>
      <div className="qr-grid">{printCards.map(c=><div key={c.registrationNumber} className="qr-print-card"><div className="qr-brand">NBSA • PRIZE POOL 2027</div>
        <img src={c.src} alt={`QR registrasi ${c.registrationNumber}`}/><strong>REG. {c.registrationNumber}</strong>
        <small>Scan saat Prize Pool • token: 2027 + nomor reg.</small></div>)}</div></div>}
  </main>;
}
export default function App(){
  const [view,setView]=useState(initialView);
  const [info,setInfo]=useState(null);
  const [infoError,setInfoError]=useState('');
  const reloadInfo=useCallback(()=>{
    if(!isConfigured)return;
    prizePoolRequest('publicInfo').then(v=>{setInfo(v);setInfoError('');}).catch(e=>setInfoError(e.message));
  },[]);
  useEffect(()=>reloadInfo(),[reloadInfo]);
  function switchView(next){setView(next);const url=new URL(window.location.href);if(next==='admin')url.searchParams.set('admin','1');else url.searchParams.delete('admin');window.history.replaceState(null,'',url);}
  return <div className="app-shell"><PageHeader view={view} setView={switchView}/>
    {infoError&&isConfigured&&<div className="container"><Notice type="error">Tidak dapat mengakses Apps Script: {infoError}</Notice></div>}
    {view==='admin'?<AdminPage refreshPublicInfo={reloadInfo}/>:<ParticipantPage info={info} reloadInfo={reloadInfo}/>}
    <footer className="site-footer"><div className="container">© NBSA Prize Pool 2027 <span>•</span> 1 tiket per karyawan</div></footer>
  </div>;
}
