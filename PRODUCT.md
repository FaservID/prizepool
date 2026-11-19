# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Karyawan sebagai peserta pemegang tiket. Panitia mengelola tiket, menyiapkan cetak, dan membuka sesi pengecekan. EO menentukan peserta yang berhak mengikuti Hidden Prize.

## Product Purpose

Sistem tiket QR dan pengecekan hasil Hidden Prize acara NBSA. Peserta memindai tiket lalu memasukkan token pengecekan yang sesuai; panitia mengendalikan kapan hasil dapat dibuka.

## Operating Context

Tiket disiapkan sebelum acara, dibagikan saat registrasi, dan diperiksa melalui ponsel saat sesi dibuka. Panitia memakai halaman admin dan Google Spreadsheet/Apps Script. EO mengisi hasil melalui CSV.

## Capabilities and Constraints

- Jumlah tiket dikonfigurasi panitia saat DRAFT, sebelum tiket dibuat. Default 65 untuk kompatibilitas acara lama; rentang implementasi 8–999 mempertahankan nomor 3 digit. Jumlah terpilih mengikuti nilai TRUE dalam berkas hasil, dari 0 sampai seluruh tiket; tidak ada batas tetap 8.
- Sesudah dibuat, jumlah dan data tiket terkunci. Nomor berurutan mulai 001; token tetap 2027XXX. CSV EO, statistik, ekspor JPG/ZIP, dan cetak mengikuti jumlah tersimpan.
- Peserta, login, dan admin memakai light mode saja, tanpa mengikuti tema OS atau preferensi dark lama.
- QR universal mengarahkan peserta ke tautan aplikasi, dan peserta memasukkan token pengecekan pada tiket fisik. Hasil CSV atau Excel (.xlsx, tab EO_Import) dibaca lokal di browser. Konfirmasi menunjukkan jumlah TRUE/FALSE dan memperingatkan bila tidak ada tiket terpilih. Hasil diimpor sekali per sesi, dikunci, dan tidak berubah ketika dipindai ulang.
- Admin dapat melakukan reset sesi setelah konfirmasi: hapus hasil terpilih, waktu pengecekan, dan waktu penguncian; pertahankan jumlah, nomor, token, QR, pengaturan acara, serta riwayat audit. Reset kembali ke TICKETS_READY dan wajib diikuti impor hasil sebelum sesi dibuka kembali. Cache hasil dipisahkan per sesi.
- Pertahankan backend Google Apps Script dan alur DRAFT, TICKETS_READY, IMPORTING, LOCKED, LIVE, CLOSED. RESETTING menutup verifikasi dan impor selama reset; bila terhenti, admin dapat mengulangi reset.
- Tabel dan statistik admin diperbarui otomatis melalui polling adminStats, dengan jeda 5 detik setelah respons sebelumnya. Polling dijeda saat tab tersembunyi, proses admin, atau ekspor; tersedia tombol jeda dan segarkan manual. Respons lama tidak boleh menimpa hasil mutasi atau sesi login baru. Tidak ada koneksi push realtime.
- Remake mencakup halaman peserta dan admin yang responsif.
- QR cetak harus menerima logo perusahaan dari unggahan pengguna, ditempatkan di tengah.
- Sediakan pengaturan tampilan QR, pratinjau, cetak A4, dan bulk ZIP. ZIP mengemas berkas gambar QR Code individual (hanya QR murni, tanpa desain kartu atau teks tambahan).
- Gunakan logo resmi yang tersedia di repositori (`public/pt-nbsa-logo.png`). Jangan mengarang logo atau mengganti data acara dengan data contoh yang tampak nyata.

## Brand Commitments

Tema acara: Garden Bloom. Nama NBSA dan tahun/token 2027 dari aplikasi dipertahankan. Bahasa antarmuka: Indonesia.

## Evidence on Hand

Implementasi React/Vite pada src/, backend pada apps-script/Code.gs, pengujian node pada tests/, template EO asli pada public/ dan examples/. Tidak ada logo perusahaan atau fotografi acara dalam repositori saat remake dimulai.

## Product Principles

- Pemeriksaan tiket tetap terpisah dari keputusan EO.
- Status sesi dan tindakan yang tersedia harus jelas bagi peserta maupun panitia.
- Logo tidak boleh mengorbankan keterbacaan QR.
- Data tiket dan logo diproses untuk ekspor di browser, bukan dikirim ke layanan gambar eksternal.
