# NBSA Prize Pool 2027 — React + Google Sheets (versi tiket QR + CSV EO)

**Dibuat untuk GitHub Pages, memakai React/Vite, Google Spreadsheet privat, dan Google Apps Script.** Tidak perlu database MySQL maupun VPS.

## Alur final operasional

| Waktu | Tugas panitia / EO | Sistem |
|---|---|---|
| **H-1** | Admin klik **Generate 65 Tiket**, kemudian **Cetak Semua Tiket**. | Membuat `001`–`065`, kode `2027001`–`2027065`, serta 65 QR acak unik; **belum ada yang TRUE**. |
| **Hari H: registrasi awal** | Bagikan **1 tiket ke 1 karyawan** secara acak. Nama tidak dicatat. | QR merujuk ke tiket masing-masing, tidak memuat nama/pemenang. |
| **Hari H: sebelum Prize Pool** | EO mengunduh **Template CSV EO** atau **Template Excel**, mengubah **tepat 8** kolom `terpilih` menjadi `TRUE`, menyisakan **57 FALSE**. | Hasil belum otomatis terlihat oleh karyawan. |
| **Sebelum pengumuman** | EO mengirimkan file CSV yang sudah diedit kepada admin, admin klik **Upload CSV EO**. | Backend validasi 65 nomor + token + tepat 8 TRUE, lalu **kunci hasil** (LOCKED). |
| **Sesi Prize Pool** | MC meminta karyawan scan QR dan mengetik `2027` + nomor tiket 3 digit (contoh reg. `052` menjadi `2027052`). Admin klik **Aktifkan Prize Pool**. | Sistem memastikan QR acak **cocok** dengan kode pengecekan; lalu tampilkan eligible TRUE / FALSE. |
| **Selesai** | Admin klik **Tutup Sesi**. | Pengecekan ditutup, riwayat scan tersimpan. |

**Tidak ada pengacakan pemenang di aplikasi.** EO yang menentukan tepat 8 `TRUE` melalui file. Tidak ada nama karyawan pada spreadsheet, tiket, atau formulir. Cetak ulang harus memakai QR yang **sama** (jangan generate ulang).

## Contoh CSV EO

File unduhan memiliki **66 baris**: 1 header + 65 nomor:

```csv
nomor_registrasi,token_pengecekan,terpilih
001,2027001,FALSE
002,2027002,FALSE
003,2027003,FALSE
...
052,2027052,FALSE
...
065,2027065,FALSE
```

EO harus mengganti **8 baris** menjadi `TRUE`, tanpa menghapus baris, mengganti nomor atau mengganti token. Backend tidak mengizinkan 7, 9, atau 65 TRUE, nomor duplikat, atau token salah. Impor hanya diizinkan **sekali** dan hasil tidak bisa ditimpa dari dashboard.

Jika membuka CSV di Excel, kolom `001` dapat berubah menjadi `1` secara otomatis. Importer frontend menerima `1` dan mengubahnya ke `001`; namun demi kerapian **disarankan memakai template XLSX**, karena kolom nomor registrasi sudah diformat sebagai teks. Setelah edit tab **EO_Import**, ekspor sebagai **CSV UTF-8** sebelum import di web admin. Berkas Excel `.xlsx` **tidak bisa langsung di-upload**; tombol import saat ini hanya mendukung CSV.

Template juga tersedia di `examples/Template_EO_PrizePool_2027.xlsx` dan `examples/template_EO_prizepool_2027.csv`. Tombol download di dashboard mengambil data aktif dari backend untuk CSV, dan versi XLSX standar dari direktori `public/`.

## Cara update dari proyek `FaservID/prizepool` lama

**Penting:** kode lama memakai **ID peserta + nama** dan mengacak 8 hasil secara otomatis. **Jangan gunakan dua versi itu bersamaan.**

### 1. Update GitHub

1. Unduh ZIP versi ini, **extract** di PC.
2. Buka repo GitHub `FaservID/prizepool`, upload isi folder ke **root repository** (bukan ZIP-nya).
3. **Timpa** file lama `src/App.jsx`, `src/utils.js`, `apps-script/Code.gs`, `README.md`, `tests`, dll.
4. Pastikan folder tersembunyi `.github/workflows/deploy.yml` tetap ada, dan **tambahkan** folder `public/` dengan template XLSX.
5. `Settings → Pages → Source = GitHub Actions`; cek tab **Actions** setelah commit. URL peserta tetap `https://faservid.github.io/prizepool/`, admin `https://faservid.github.io/prizepool/?admin=1`.
6. Variable GitHub **`VITE_GAS_URL` tetap sama** bila deployment Google Apps Script yang lama diedit sebagai *new version*, bukan dibuat deployment baru.

### 2. Update Google Apps Script (WAJIB)

1. Buka spreadsheet yang terhubung Apps Script lama.
2. Ganti **seluruh** isi file `Code.gs` dengan `apps-script/Code.gs` dari ZIP baru.
3. Save. Jika database lama **belum pernah diisi 65 peserta**, jalankan `setupProject()` lagi. Script akan mengganti header Participants versi lama menjadi baru, tetapi tidak menghapus data peserta yang sudah ada.
4. Jika sheet lama **sudah berisi data peserta atau pernah dilakukan pengacakan**, **buat spreadsheet baru** dan pasang `Code.gs` di Apps Script spreadsheet baru agar QR lama tidak rusak atau hasil lama tidak tertukar. Lalu atur password, domain dan URL deploy baru.
5. Kembali ke spreadsheet, refresh. Dari menu **🎁 Prize Pool**: set password minimal 12 karakter; atur origin `https://faservid.github.io`; atur judul acara jika perlu.
6. **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**. Jangan sekadar Save karena versi publik Apps Script tidak langsung berubah.
7. Jika memakai deployment baru, update GitHub variable `VITE_GAS_URL` dan jalankan ulang workflow Deploy React.

**Saat migrasi jangan menjalankan `setupProject` pada spreadsheet yang berisi data produksi lama.** Kode menolak schema lama berdata untuk mencegah kehilangan data.

### 3. Konfigurasi Apps Script untuk pertama kali

1. Buat Google Spreadsheet **privat**, lalu `Extensions → Apps Script`.
2. Tempel `apps-script/Code.gs`, jalankan `setupProject` sekali (tidak akan meminta password saat Run).
3. Refresh spreadsheet agar menu **🎁 Prize Pool** tampil. Pilih **Atur Password Admin**, lalu **Atur Domain Website** → `https://faservid.github.io` (tanpa `/prizepool/`).
4. `Deploy → New deployment → Web app` → `Execute as: Me` dan `Who has access: Anyone` → Deploy, salin URL yang berakhiran `/exec`.
5. Di GitHub `Settings → Secrets and variables → Actions → Variables`, simpan `VITE_GAS_URL = .../exec`, jalankan workflow GitHub Actions.

Backend menggunakan iframe POST + `postMessage` untuk menanggapi browser GitHub Pages. Ini perlu diuji **end-to-end** pada perangkat dan akun Google yang akan digunakan. Agar kode tidak mengakses langsung Sheets dengan API key publik, semua operasi privileged hanya ada di Apps Script. Password admin dikirim via HTTPS, diperiksa di server, disimpan dalam hash+salt Script Properties; jangan letakkan di React atau GitHub.

## Fitur & status

- `DRAFT` — belum ada tiket; hanya bisa generate 65 tiket.
- `TICKETS_READY` — 65 QR telah ditentukan tetapi **belum ada hasil TRUE**. Cetak dan unduh template EO, kemudian import CSV saat hari H.
- `IMPORTING` — status fail-closed bila penulisan hasil EO terhenti; periksa secara manual, **jangan** acak ulang.
- `LOCKED` — sudah valid 8 TRUE dan 57 FALSE, belum diumumkan.
- `LIVE` — QR + token kode dapat dipakai peserta untuk cek hasil.
- `CLOSED` — pengumuman ditutup.

Daftar tiket berada pada tab `Participants`, dengan kolom `nomor_registrasi`, `token_pengecekan`, `qr_token`, `terpilih`, `waktu_scan_pertama`.

## Keamanan / batasan

- Kode `2027NNN` mudah ditebak dan **bukan rahasia**. Aplikasi hanya mengizinkan cek bila pasangan **QR acak 64 hex + token 2027NNN** cocok dengan baris database.
- Siapa pun yang memegang atau memfoto QR beserta nomor tiket dapat melakukan pengecekan. Panitia perlu memeriksa **tiket fisik** saat mengklaim hadiah, dan melarang pertukaran tiket jika aturan acara menghendakinya.
- Google Sheets tetap bisa diubah manual oleh orang yang memiliki hak edit; batasi akses edit untuk panitia inti dan simpan salinan file EO final sebagai audit.
- Web statis + Apps Script bergantung pada kuota layanan Google dan dukungan browser terhadap bridge iframe. Uji bersama beberapa HP sebelum hari H.
- Semua file input diuji sebelum diimpor, tetapi Apps Script tidak bersertifikasi untuk mekanisme undian berhadiah dengan jaminan regulasi atau high-assurance security.
- Tidak ada perubahan nama karyawan atau upload data personal: aplikasi hanya mencatat nomor tiket, token, status, dan waktu scan.

## Pengembangan dan pengujian lokal

```bash
npm install
npm test
npm run dev
npm run build
```

Saat development di laptop tambahkan `http://localhost:5173` ke origin pada menu spreadsheet. File `.env.example` dapat disalin menjadi `.env`; `VITE_BASE_PATH=/`, `VITE_GAS_URL=<URL exec>`.

**Pengujian otomatis:** simulasi backend Google Spreadsheet dan Apps Script di Node (`npm test`) mencakup 65 tiket, 8 TRUE, hasil terkunci, QR dan token tidak boleh tertukar, serta scan ulang yang konsisten. Tes itu **bukan** pengganti pengujian dengan Google Apps Script sungguhan.
# prizepool
