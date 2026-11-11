# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Karyawan sebagai peserta pemegang tiket. Panitia mengelola tiket, menyiapkan cetak, dan membuka sesi pengecekan. EO menentukan peserta yang berhak mengikuti prize pool.

## Product Purpose

Sistem tiket QR dan pengecekan hasil prize pool acara NBSA. Peserta memindai tiket lalu memasukkan token pengecekan yang sesuai; panitia mengendalikan kapan hasil dapat dibuka.

## Operating Context

Tiket disiapkan sebelum acara, dibagikan saat registrasi, dan diperiksa melalui ponsel saat sesi dibuka. Panitia memakai halaman admin dan Google Spreadsheet/Apps Script. EO mengisi hasil melalui CSV.

## Capabilities and Constraints

- Aturan dipertahankan, dikonfirmasi pengguna: tepat 65 tiket, nomor 001 sampai 065, token 2027XXX, tepat 8 TRUE dari EO.
- QR rahasia harus cocok dengan token pengecekan. Hasil diimpor sekali, dikunci, dan tidak berubah ketika dipindai ulang.
- Pertahankan backend Google Apps Script dan alur DRAFT, TICKETS_READY, IMPORTING, LOCKED, LIVE, CLOSED.
- Remake mencakup halaman peserta dan admin yang responsif.
- QR cetak harus menerima logo perusahaan dari unggahan pengguna, ditempatkan di tengah.
- Sediakan pengaturan tampilan QR, pratinjau, cetak A4, dan bulk JPG. ZIP menjadi wadah sekali unduh untuk berkas JPG individual.
- Logo perusahaan belum diberikan. Jangan mengarang logo atau mengganti data acara dengan data contoh yang tampak nyata.

## Brand Commitments

Tema acara: Garden Bloom. Nama NBSA dan tahun/token 2027 dari aplikasi dipertahankan. Bahasa antarmuka: Indonesia.

## Evidence on Hand

Implementasi React/Vite pada src/, backend pada apps-script/Code.gs, pengujian node pada tests/, template EO asli pada public/ dan examples/. Tidak ada logo perusahaan atau fotografi acara dalam repositori saat remake dimulai.

## Product Principles

- Pemeriksaan tiket tetap terpisah dari keputusan EO.
- Status sesi dan tindakan yang tersedia harus jelas bagi peserta maupun panitia.
- Logo tidak boleh mengorbankan keterbacaan QR.
- Data tiket dan logo diproses untuk ekspor di browser, bukan dikirim ke layanan gambar eksternal.
