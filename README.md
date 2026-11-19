# NBSA Hidden Prize 2027 — React + Google Sheets (versi tiket QR + CSV EO)

**Dibuat untuk GitHub Pages, memakai React/Vite, Google Spreadsheet privat, dan Google Apps Script.** Tidak perlu database MySQL maupun VPS.

## Alur final operasional

| Waktu | Tugas panitia / EO | Sistem |
|---|---|---|
| **H-1** | Admin mengisi **Jumlah tiket** pada **Pengaturan sesi**, klik **Buat tiket**, lalu unduh JPG/ZIP atau buka **Pratinjau cetak A4**. | Membuat nomor berurutan mulai `001` dan token `2027` + nomor sebanyak konfigurasi; **belum ada yang TRUE**. Semua QR berisi tautan halaman peserta yang sama, tanpa parameter token. |
| **Hari H: registrasi awal** | Bagikan **1 tiket ke 1 karyawan** secara acak. Nama tidak dicatat. | QR universal membuka halaman peserta, tidak memuat nomor tiket, nama, atau pemenang. |
| **Hari H: sebelum Hidden Prize** | EO memilih **Unduh format CSV** sesuai jumlah tiket, lalu mengisi kolom `terpilih` dengan `TRUE` untuk tiket terpilih dan `FALSE` untuk lainnya. Jumlah terpilih mengikuti berkas. | Hasil belum otomatis terlihat oleh karyawan. Template Excel standar tersedia hanya untuk 65 tiket. |
| **Sebelum pengumuman** | EO mengirimkan berkas akhir kepada admin, lalu admin memilih **Unggah berkas CSV atau Excel**. | Aplikasi menampilkan jumlah TRUE/FALSE untuk dikonfirmasi; backend memvalidasi seluruh nomor, pasangan token, dan status boolean, lalu mengunci hasil (LOCKED). |
| **Sesi Hidden Prize** | MC meminta karyawan memindai QR dan memasukkan `2027` + nomor tiket 3 digit (contoh registrasi `052` menjadi `2027052`). Admin memilih **Buka sesi pengecekan**. | Sistem memeriksa token pengecekan saat sesi LIVE, lalu menampilkan status terpilih TRUE / FALSE. |
| **Selesai** | Admin memilih **Tutup sesi pengecekan**. | Pengecekan ditutup, riwayat scan tersimpan. |

**Tidak ada pengacakan peserta terpilih di aplikasi.** EO menentukan status `TRUE`/`FALSE` melalui berkas. Jumlah terpilih boleh 0 sampai seluruh tiket; konfirmasi impor memperingatkan jika jumlahnya 0. Tidak ada nama karyawan pada spreadsheet, tiket, atau formulir. Cetak ulang harus memakai QR yang **sama** (jangan generate ulang).

## Konfigurasi jumlah tiket

Pada status `DRAFT`, isi **Jumlah tiket** (bilangan bulat 8–999) sebelum menekan **Buat tiket**. Rentang jumlah tiket tetap 8–999; jumlah terpilih tidak dibatasi 8. Default 65 tetap tersedia untuk acara lama. Jumlah disimpan sebagai `TICKET_COUNT` di tab `Settings` ketika tiket dibuat.

Setelah dibuat, jumlah, nomor, dan token tiket tidak dapat diubah melalui aplikasi. Statistik, CSV EO, jumlah JPG dalam ZIP, progres ekspor, dan cetak A4 mengikuti konfigurasi tersimpan. Jangan mengubah `TICKET_COUNT` atau baris tiket secara manual untuk mengubah jumlah acara berjalan. Gunakan spreadsheet baru untuk acara terpisah.

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

EO mengisi `TRUE` pada nomor terpilih dan `FALSE` pada lainnya, tanpa menghapus baris, mengganti nomor, atau mengganti token. Huruf besar/kecil diterima; sel kosong atau nilai selain TRUE/FALSE ditolak. Backend tetap menolak jumlah baris yang tidak sesuai konfigurasi, nomor duplikat, token salah, dan status bukan boolean. Impor hanya diizinkan sekali per sesi. Hasil terkunci tidak bisa ditimpa; admin harus melakukan reset sesi terlebih dahulu sebelum mengimpor hasil pengganti.

Jika membuka CSV di Excel, kolom `001` dapat berubah menjadi `1` secara otomatis. Importer frontend menerima `1` dan mengubahnya ke `001`. Untuk semua jumlah tiket, gunakan CSV unduhan dashboard yang berasal dari data aktif backend. Simpan hasil akhir sebagai CSV UTF-8. Berkas Excel `.xlsx` juga bisa diunggah langsung: aplikasi membaca tab `EO_Import`, termasuk sel boolean TRUE/FALSE Excel, tanpa mengirim workbook ke layanan luar. Batas unggahan 2 MB; `.xls` tidak didukung.

Template statis `examples/Template_EO_PrizePool_2027.xlsx`, `examples/template_EO_prizepool_2027.csv`, dan XLSX di `public/` berisi 65 tiket. Link Excel pada dashboard hanya tampil untuk konfigurasi 65; kolom nomor pada tab `EO_Import` sudah diformat sebagai teks. Untuk jumlah lain, gunakan CSV dinamis, bukan template statis tersebut. Jika hasil terbaca 0 padahal ada pilihan, pastikan perubahan tersimpan di kolom `terpilih` pada `EO_Import` dan unggah berkas hasil edit, bukan unduhan awal yang seluruhnya FALSE. Untuk CSV, ekspor tab `EO_Import`, bukan `PANDUAN`.

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

Untuk pembaruan dari versi tiket QR yang sudah memakai schema sekarang, perbarui `Code.gs` dan deploy sebagai **New version**, lalu perbarui frontend. Tidak perlu inisialisasi atau generate ulang tiket. Acara lama tanpa key `TICKET_COUNT` tetap dibaca sebagai 65 tiket; data tiket dan hasil EO dipertahankan. Ekspor QR kini berisi tautan umum halaman peserta, misalnya `https://faservid.github.io/prizepool/`, tanpa `?qr=...`. Tautan cetakan lama tetap bisa dibuka; frontend baru mengabaikan parameter QR lama dan meminta token `2027NNN`. Backend juga masih memvalidasi pasangan QR/token bila klien lama mengirimkannya. Kolom `qr_token` tetap disimpan untuk kompatibilitas, tetapi bukan syarat pengecekan melalui tautan umum. Konfigurasi jumlah baru hanya tersedia ketika status masih `DRAFT`. Backend wajib diperbarui sebelum memakai frontend dan ekspor QR universal.

Untuk pembaruan jumlah terpilih dinamis dan tombol reset, deploy `Code.gs` terbaru sebagai **New version sebelum memperbarui frontend**. Backend lama masih menolak jumlah selain 8 dan belum mengenali `adminResetSession`. Tiket tidak perlu dibuat ulang; hasil yang sudah LOCKED/LIVE/CLOSED tetap terkunci sampai admin mengonfirmasi reset sesi.

### 3. Konfigurasi Apps Script untuk pertama kali

1. Buat Google Spreadsheet **privat**, lalu `Extensions → Apps Script`.
2. Tempel `apps-script/Code.gs`, jalankan `setupProject` sekali (tidak akan meminta password saat Run).
3. Refresh spreadsheet agar menu **🎁 Hidden Prize** tampil. Pilih **Atur Password Admin**, lalu **Atur Domain Website** → `https://faservid.github.io` (tanpa `/prizepool/`).
4. `Deploy → New deployment → Web app` → `Execute as: Me` dan `Who has access: Anyone` → Deploy, salin URL yang berakhiran `/exec`.
5. Di GitHub `Settings → Secrets and variables → Actions → Variables`, simpan `VITE_GAS_URL = .../exec`, jalankan workflow GitHub Actions.

Backend menggunakan iframe POST + `postMessage` untuk menanggapi browser GitHub Pages. Ini perlu diuji **end-to-end** pada perangkat dan akun Google yang akan digunakan. Agar kode tidak mengakses langsung Sheets dengan API key publik, semua operasi privileged hanya ada di Apps Script. Password admin dikirim via HTTPS, diperiksa di server, disimpan dalam hash+salt Script Properties; jangan letakkan di React atau GitHub.

## Fitur & status

- `DRAFT`: belum ada tiket; panitia mengatur jumlah 8–999 sebelum membuat tiket.
- `TICKETS_READY`: jumlah dan data tiket sudah terkunci, tetapi hasil belum diimpor. Cetak dan unduh format hasil, kemudian impor CSV atau XLSX saat hari H.
- `IMPORTING`: verifikasi ditutup selama penulisan hasil. Bila status tidak berubah setelah proses selesai, reset sesi sebelum mengimpor ulang.
- `RESETTING`: verifikasi dan impor ditutup selama reset. Bila reset terhenti, segarkan data dan ulangi reset setelah proses sebelumnya selesai.
- `LOCKED`: seluruh status TRUE/FALSE telah divalidasi dan dikunci sesuai berkas, belum diumumkan.
- `LIVE`: tautan QR universal + token pengecekan dapat dipakai peserta untuk cek hasil.
- `CLOSED`: pengumuman ditutup.

Daftar tiket berada pada tab `Participants`, dengan kolom `nomor_registrasi`, `token_pengecekan`, `qr_token`, `terpilih`, `waktu_scan_pertama`.

### Pembaruan otomatis tabel admin

Setelah login, tabel tiket dan angka statistik diperbarui otomatis melalui `adminStats`. Peserta yang berhasil mengecek tiket akan tercatat sebagai **Sudah diperiksa** tanpa panitia menekan **Segarkan data**. Pembaruan memakai polling dengan jeda 5 detik setelah respons sebelumnya selesai, ditambah waktu respons Apps Script; bukan push realtime instan.

Hanya satu request polling berjalan pada satu waktu. Polling dijeda saat tab tersembunyi, operasi admin, atau ekspor; saat tab terlihat kembali, pembaruan langsung dicoba. **Jeda pembaruan otomatis** menghentikan polling sampai diaktifkan lagi, sedangkan **Segarkan data** tetap tersedia. Pencarian, tampilan hasil, pengaturan ekspor, dan kolom jumlah tiket yang sedang diedit tidak direset oleh polling. Jika koneksi gagal, data terakhir tetap tampil dengan pesan gagal; jeda percobaan bertambah menjadi 10, 20, lalu maksimal 30 detik dan kembali 5 detik setelah berhasil. Request browser yang dibatalkan dibersihkan dan respons terlambat diabaikan; pembatalan tidak menghentikan eksekusi Apps Script yang sudah berjalan.

Fitur ini memakai endpoint admin yang sudah ada, tanpa mengubah data atau hasil. Setiap tab admin aktif menambah request Apps Script, jadi hindari membuka banyak tab pemantauan. Perubahan polling cukup memperbarui frontend; backend tetap harus memakai versi terbaru untuk fitur impor dinamis dan reset sesi.

### Reset sesi tanpa mengganti tiket

Pada **Pengaturan sesi**, pilih **Reset sesi** lalu baca konfirmasinya. Tindakan ini menutup pengecekan, mengembalikan seluruh `terpilih` ke FALSE, mengosongkan `waktu_scan_pertama` dan `LOCKED_AT`, lalu mengembalikan status ke `TICKETS_READY`. Hasil dan waktu pengecekan yang dihapus tidak dapat dipulihkan melalui aplikasi. Nomor, token, jumlah tiket, QR tercetak, password, dan pengaturan acara tetap sama. Riwayat `Audit` tidak dihapus; reset menambahkan catatan baru.

Setelah reset, unggah CSV/XLSX baru, konfirmasi jumlah terpilih, lalu buka sesi pengecekan. Reset tersedia setelah tiket dibuat, termasuk untuk memulihkan proses `IMPORTING` atau `RESETTING` yang terhenti. Tidak ada reset otomatis dan tidak perlu membuat tiket ulang. Status `CLOSED` tidak dapat langsung dibuka kembali tanpa reset dan impor baru.

Setiap reset mengganti `SESSION_ID` internal untuk memisahkan cache hasil lama. Request verifikasi lama yang menemui ID sesi berbeda ditolak sebelum mencatat scan pada sesi baru atau mengembalikan hasil. Reset tidak menarik kembali hasil yang sudah tampil di ponsel peserta. Jika koneksi admin habis waktu, segarkan data sebelum mencoba tindakan berikutnya; timeout browser tidak membuktikan proses backend berhenti. Reset memakai beberapa penulisan spreadsheet, bukan transaksi atomik; jika gagal sebelum selesai, status `RESETTING` menahan verifikasi dan impor sampai admin mengulangi reset.

## Keamanan / batasan

- **QR universal:** QR Code berisi satu tautan umum tanpa rahasia tiket individual (`?qr=...`). Peserta cukup memindai QR dan memasukkan token `2027NNN` dari tiket fisik. Karena token berurutan (`2027001` dst.), siapa pun yang membuka tautan bisa mengetikkan nomor tiket lain. Pengecekan via tautan universal **tidak membuktikan kepemilikan tiket fisik**. Panitia **wajib memverifikasi tiket fisik asli** sebelum menyerahkan hadiah.
- Format lama yang menyertakan QR rahasia (baik alias 16 karakter maupun 64 hex) tetap diterima backend bila klien lama mengirimkannya.
- Google Sheets tetap bisa diubah manual oleh orang yang memiliki hak edit; batasi akses edit untuk panitia inti dan simpan salinan file EO final sebagai audit.
- Web statis + Apps Script bergantung pada kuota layanan Google dan dukungan browser terhadap bridge iframe. Sesuai dokumentasi resmi Google, batas eksekusi bersamaan (*simultaneous executions*) adalah 30 per akun Google pengguna (1.000 per script); kuota 20.000/100.000 per hari adalah kuota URL Fetch keluar, bukan kuota Web App HTTP masuk. Jika lonjakan request melampaui batas bersamaan Google, server dapat menolak request sebelum kode script dieksekusi.
- **Optimasi scan serentak:**
  - Cache server-side (*ScriptCache*) memangkas I/O spreadsheet: daftar tiket dan hasil verifikasi di-cache hingga 5 menit; statistik publik di-cache 5 detik. Status dan `SESSION_ID` tetap dibaca langsung dari `Settings` pada setiap verifikasi dan diperiksa ulang sebelum hasil dikembalikan. Cache memakai namespace per sesi; statistik publik juga dipisahkan berdasarkan status. Scan ulang tiket yang sama dilayani dari cache hasil verifikasi tanpa membaca tab `Participants` dan tanpa mengambil lock.
  - Sesi yang diaktifkan ke `LIVE` langsung menghangatkan cache daftar tiket agar verifikasi awal tidak membaca massal seluruh baris tiket.
  - Verifikasi cache-miss menunggu lock maksimal 100 ms (`tryLock(100)`). Di dalam lock, backend membaca satu baris tiket, menulis timestamp scan pertama, mencatat audit log, dan memanggil `flush()`. First-scan tetap dicatat serial di spreadsheet.
  - Jika lock gagal didapat dalam 100 ms karena contention, envelope JSON mengembalikan `retryable: true` dengan pesan server sibuk (kode error `BUSY` ditangani internal).
  - Browser melakukan retry otomatis dengan jitter awal (0–1,5 detik) dan backoff eksponensial (jeda 1–2s, 2–4s, 4–8s, timeout 15 detik per percobaan, maksimal 4 percobaan) hanya untuk verifikasi tiket dan informasi publik saat menerima `retryable: true` atau transport timeout. Error bisnis (token salah, sesi belum dibuka atau ditutup) langsung berhenti tanpa retry. Mutasi admin tidak pernah di-retry otomatis.
  - Halaman peserta tidak memanggil ulang info publik tambahan setelah verifikasi berhasil. Statistik publik dapat tertinggal hingga TTL 5 detik.
  - Optimasi ini mengurangi durasi pegang lock dan pembacaan spreadsheet, tetapi tidak menambah batas kuota Google (30 simultaneous executions per akun pengguna). Jika lonjakan scan fisik melampaui kapasitas Google, request tetap dapat ditolak sebelum script berjalan. Pengujian beban nyata dengan beberapa ponsel sebelum hari H tetap wajib dilakukan.
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

**Pengujian otomatis:** `npm test` mencakup jumlah 8, 65, 100, dan 999, kompatibilitas acara lama, penolakan konfigurasi invalid tanpa perubahan data, CSV/XLSX dengan jumlah terpilih dinamis (termasuk 0 dan seluruh tiket), boolean Excel, validasi berkas rusak, hasil terkunci, URL dan verifikasi universal, kompatibilitas pasangan QR/token lama, scan ulang, ekspor ZIP universal dengan jumlah dinamis, 20 pengujian API dengan browser mock (jitter, timeout 4 percobaan, pemulihan BUSY, isolasi mutasi admin, polling serial, jeda tab tersembunyi, backoff, pembatalan, dan penolakan respons terlambat), serta pengujian backend konkurensi (interleaving deterministik, fail-open cache, batas tunggu lock 100 ms, pemanasan cache LIVE), reset sesi tanpa mengganti tiket/QR, impor baru setelah reset, pemulihan reset gagal, dan isolasi cache/request antar sesi. Pemeriksaan tombol reset dan light-only berbasis source; tes canvas memakai mock, bukan rasterisasi atau pemindaian QR sungguhan. Tes ini bukan pengganti pemeriksaan browser, cetak/pindai fisik, atau pengujian Google Apps Script end-to-end.
# prizepool
