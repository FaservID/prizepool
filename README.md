# NBSA Hidden Prize 2027 — React + Google Sheets (versi tiket QR + CSV EO)

**Dibuat untuk GitHub Pages, memakai React/Vite, Google Spreadsheet privat, dan Google Apps Script.** Tidak perlu database MySQL maupun VPS.

## Alur final operasional

| Waktu | Tugas panitia / EO | Sistem |
|---|---|---|
| **H-1** | Admin mengisi **Jumlah tiket** pada **Pengaturan sesi**, klik **Buat tiket**, lalu unduh JPG/ZIP atau buka **Pratinjau cetak A4**. | Membuat nomor berurutan mulai `001`, token `2027` + nomor, serta QR acak unik sebanyak konfigurasi; **belum ada yang TRUE**. |
| **Hari H: registrasi awal** | Bagikan **1 tiket ke 1 karyawan** secara acak. Nama tidak dicatat. | QR merujuk ke tiket masing-masing, tidak memuat nama/pemenang. |
| **Hari H: sebelum Hidden Prize** | EO mengunduh **CSV EO** sesuai jumlah tiket, mengubah tepat 8 kolom `terpilih` menjadi `TRUE`, sisanya `FALSE`. | Hasil belum otomatis terlihat oleh karyawan. Template Excel standar tersedia hanya untuk 65 tiket. |
| **Sebelum pengumuman** | EO mengirimkan CSV akhir kepada admin, lalu admin memilih **CSV hasil EO**. | Backend memvalidasi seluruh nomor sesuai konfigurasi, pasangan token, dan tepat 8 TRUE, lalu mengunci hasil (LOCKED). |
| **Sesi Hidden Prize** | MC meminta karyawan scan QR dan mengetik `2027` + nomor tiket 3 digit (contoh reg. `052` menjadi `2027052`). Admin klik **Aktifkan Hidden Prize**. | Sistem memastikan QR acak **cocok** dengan kode pengecekan; lalu tampilkan eligible TRUE / FALSE. |
| **Selesai** | Admin klik **Tutup Sesi**. | Pengecekan ditutup, riwayat scan tersimpan. |

**Tidak ada pengacakan pemenang di aplikasi.** EO yang menentukan tepat 8 `TRUE` melalui file. Tidak ada nama karyawan pada spreadsheet, tiket, atau formulir. Cetak ulang harus memakai QR yang **sama** (jangan generate ulang).

## Konfigurasi jumlah tiket

Pada status `DRAFT`, isi **Jumlah tiket** (bilangan bulat 8–999) sebelum menekan **Buat tiket**. Batas ini mempertahankan nomor 3 digit dan tepat 8 pilihan EO. Default 65 tetap tersedia untuk acara lama. Jumlah disimpan sebagai `TICKET_COUNT` di tab `Settings` ketika tiket dibuat.

Setelah dibuat, jumlah dan QR tidak dapat diubah melalui aplikasi. Statistik, CSV EO, jumlah JPG dalam ZIP, progres ekspor, dan cetak A4 mengikuti konfigurasi tersimpan. Jangan mengubah `TICKET_COUNT` atau baris tiket secara manual untuk mengubah jumlah acara berjalan. Gunakan spreadsheet baru untuk acara terpisah.

Halaman peserta, login, dan admin hanya memakai light mode. Tema OS atau preferensi dark yang tersimpan sebelumnya tidak mengubah tampilan.

## Contoh CSV EO

File unduhan berisi 1 header dan data sebanyak konfigurasi tiket. Contoh konfigurasi default 65 menghasilkan 66 baris:

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

EO harus mengganti tepat 8 baris menjadi `TRUE`, tanpa menghapus baris, mengganti nomor, atau mengganti token. Backend menolak jumlah TRUE selain 8, jumlah baris yang tidak sesuai konfigurasi, nomor duplikat, atau token salah. Impor hanya diizinkan sekali dan hasil tidak bisa ditimpa dari dashboard.

Jika membuka CSV di Excel, kolom `001` dapat berubah menjadi `1` secara otomatis. Importer frontend menerima `1` dan mengubahnya ke `001`. Untuk semua jumlah tiket, gunakan CSV unduhan dashboard yang berasal dari data aktif backend. Simpan hasil akhir sebagai CSV UTF-8. Berkas Excel `.xlsx` tidak bisa langsung diunggah.

Template statis `examples/Template_EO_PrizePool_2027.xlsx`, `examples/template_EO_prizepool_2027.csv`, dan XLSX di `public/` berisi 65 tiket. Link Excel pada dashboard hanya tampil untuk konfigurasi 65; kolom nomor pada tab `EO_Import` sudah diformat sebagai teks. Untuk jumlah lain, gunakan CSV dinamis, bukan template statis tersebut.

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
3. Save. Jika database lama **belum pernah dibuatkan tiket**, jalankan `setupProject()` lagi. Script akan mengganti header Participants versi lama menjadi baru, tetapi tidak menghapus data peserta yang sudah ada.
4. Jika sheet lama **sudah berisi data peserta atau pernah dilakukan pengacakan**, **buat spreadsheet baru** dan pasang `Code.gs` di Apps Script spreadsheet baru agar QR lama tidak rusak atau hasil lama tidak tertukar. Lalu atur password, domain dan URL deploy baru.
5. Kembali ke spreadsheet, refresh. Dari menu **🎁 Hidden Prize**: set password minimal 12 karakter; atur origin `https://faservid.github.io`; atur judul acara jika perlu.
6. **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**. Jangan sekadar Save karena versi publik Apps Script tidak langsung berubah.
7. Jika memakai deployment baru, update GitHub variable `VITE_GAS_URL` dan jalankan ulang workflow Deploy React.

**Saat migrasi jangan menjalankan `setupProject` pada spreadsheet yang berisi data produksi lama.** Kode menolak schema lama berdata untuk mencegah kehilangan data.

Untuk pembaruan dari versi tiket QR 65 yang sudah memakai schema sekarang, cukup perbarui `Code.gs` dan deploy sebagai **New version**. Tidak perlu inisialisasi atau generate ulang. Acara lama tanpa key `TICKET_COUNT` tetap dibaca sebagai 65 tiket; QR dan hasil EO yang ada dipertahankan. Konfigurasi jumlah baru hanya tersedia ketika status masih `DRAFT`. Backend belum memakai perubahan ini sampai versi Apps Script diperbarui.

### 3. Konfigurasi Apps Script untuk pertama kali

1. Buat Google Spreadsheet **privat**, lalu `Extensions → Apps Script`.
2. Tempel `apps-script/Code.gs`, jalankan `setupProject` sekali (tidak akan meminta password saat Run).
3. Refresh spreadsheet agar menu **🎁 Hidden Prize** tampil. Pilih **Atur Password Admin**, lalu **Atur Domain Website** → `https://faservid.github.io` (tanpa `/prizepool/`).
4. `Deploy → New deployment → Web app` → `Execute as: Me` dan `Who has access: Anyone` → Deploy, salin URL yang berakhiran `/exec`.
5. Di GitHub `Settings → Secrets and variables → Actions → Variables`, simpan `VITE_GAS_URL = .../exec`, jalankan workflow GitHub Actions.

Backend menggunakan iframe POST + `postMessage` untuk menanggapi browser GitHub Pages. Ini perlu diuji **end-to-end** pada perangkat dan akun Google yang akan digunakan. Agar kode tidak mengakses langsung Sheets dengan API key publik, semua operasi privileged hanya ada di Apps Script. Password admin dikirim via HTTPS, diperiksa di server, disimpan dalam hash+salt Script Properties; jangan letakkan di React atau GitHub.

## Fitur & status

- `DRAFT`: belum ada tiket; panitia mengatur jumlah 8–999 sebelum membuat tiket.
- `TICKETS_READY`: jumlah dan QR sudah terkunci, tetapi belum ada hasil TRUE. Cetak dan unduh template EO, kemudian impor CSV saat hari H.
- `IMPORTING`: status fail-closed bila penulisan hasil EO terhenti; periksa secara manual, jangan acak ulang.
- `LOCKED`: sudah valid tepat 8 TRUE dan sisanya FALSE, belum diumumkan.
- `LIVE`: QR + token kode dapat dipakai peserta untuk cek hasil.
- `CLOSED`: pengumuman ditutup.

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

**Pengujian otomatis:** `npm test` mencakup jumlah 8, 65, 100, dan 999, kompatibilitas acara lama, penolakan konfigurasi invalid tanpa perubahan data, CSV dengan tepat 8 TRUE, hasil terkunci, pasangan QR/token, scan ulang, serta ekspor ZIP dengan jumlah dinamis. Pemeriksaan light-only berbasis source; tes canvas memakai mock, bukan rasterisasi atau pemindaian QR sungguhan. Tes ini bukan pengganti pemeriksaan browser, cetak/pindai fisik, atau pengujian Google Apps Script end-to-end.
# prizepool
