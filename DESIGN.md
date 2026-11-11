# Design System: Garden Bloom

<!-- impeccable:design-schema 1 -->

## Identity

Desain peserta merefleksikan komposisi botani bertema Garden Bloom dan identitas resmi perusahaan:
- Latar krem peach (#fbf1e5) dengan aksen radial glow floral hangat di empat sudut.
- Logo resmi PT NBSA diperbesar di area hero (68–96px) di atas judul acara dengan margin bawah yang presisi (12–18px).
- Tipografi judul acara menggunakan font serif berkarakter editorial: "Bloom &" regular (forest green #1f3a2e) dan "Beyond" italic (rose #c14453) menggunakan Cormorant Garamond 600.
- Kartu tiket putih terpusat (548px, radius 30px) dengan bayangan lembut, aksen bunga pink di sudut kanan atas, dan ornamen bunga merah di bawah tombol.
- Header atas peserta ditiadakan agar kanvas botani fokus pada identitas acara. Halaman login dan admin tetap memakai header logo PT NBSA dengan teks NBSA dan Garden Bloom bertumpuk.

## Copy & Voice

- Bahasa Indonesia lugas, profesional, dan ramah untuk acara internal perusahaan.
- Nomor registrasi 3 digit mulai `001` sampai jumlah tiket tersimpan (8–999); token 7 digit berupa `2027` + nomor registrasi. Default 65 tetap didukung untuk acara lama.
- Tidak ada badge dekoratif kosong atau status palsu; status berasal dari Google Apps Script.

## Color Palette & Measured Contrast

### Daylight Garden (Light Mode)
- Canvas: `#fbf1e5` dengan glow floral radial hangat
- Surface: `#ffffff`
- Surface Subtle: `#fbf6ef`
- Text Main: `#1f3a2e` / `#213a30` (11.0:1 contrast pada canvas krem, 14.2:1 pada surface putih)
- Text Muted: `#586a60` (5.2:1 contrast pada surface putih, lolos AA)
- Forest Deep / Button: `#416b57` gradient `#4e795f` (4.97:1 contrast teks putih pada gradien terterang, lolos AA normal text)
- Bloom Rose Title: `#c14453` (4.46:1 contrast pada canvas krem; judul ukuran besar >38px lolos syarat 3.0:1 large text)
- Border Control: `#8c978e` (3.1:1 contrast pada kontrol)

Light mode menjadi satu-satunya tema untuk peserta, login, dan admin. Tema OS dan preferensi dark lama diabaikan; kontrol penggantian tema ditiadakan.

## Typography

- Event Heading: `Cormorant Garamond` (lokal TTF, SIL OFL) 600, `clamp(32px, 4.4vw, 68px)`, line-height 1.04, `em` italic rose
- Subtitle & Footnote: `Plus Jakarta Sans`, 500 / 600
- Body & Form: `Plus Jakarta Sans`, 400 / 500 / 600 / 700
- Token figures: tabular monospace saat verifikasi

## Layout & Components

- Peserta: Kartu tiket terpusat 548px dengan radius 30px, input token 62px dengan ikon kunci, tombol periksa 60px dengan ikon cari, serta ornamen bunga di bawah kartu.
- Header: Pada halaman login dan dashboard admin (?admin=1), header tetap ditampilkan dengan logo PT NBSA dan teks brand bertumpuk. Pada halaman peserta publik, header ditiadakan agar kanvas langsung menyajikan logo hero dan tajuk Bloom & Beyond.
- Login & Admin: Mengikuti bahasa visual index (Bloom & Beyond) dengan kanvas krem peach hangat, tipografi Cormorant Garamond 600, dan palet forest green/rose. Halaman login memakai kartu tiket 548px dengan aksen bunga pink dan ornamen bunga merah. Halaman dashboard memakai panel beradius senada dengan cabang sudut botani statis agar panitia tetap fokus pada operasi sesi dan tiket.
- Footer: Ramping dan terpusat dengan identitas acara ("NBSA Hidden Prize 2027 · Bloom & Beyond").
- Bunga dekoratif: Pada halaman peserta, cabang botani dan aksen bunga kartu terus berayun 6 detik per arah; kelopak melayang 7 detik per arah. Gerakan bergantian tanpa lompatan antar-siklus, dengan fase berbeda seperti gerakan saat refresh. Animasi otomatis dijeda saat elemen keluar layar (IntersectionObserver) atau tab tersembunyi (visibilitychange). Form dan logo tetap diam. Pada halaman admin, bingkai bunga ditampilkan statis.
- Reduced motion: Semua animasi dekoratif dinonaktifkan untuk pengguna dengan preferensi `prefers-reduced-motion: reduce`.
- Responsif: Gutter 16px pada viewport ponsel (<=600px), panel dengan padding lebih ringkas, dan pratinjau QR persegi yang mengikuti ruang tersedia (`width: min(100%, 220px)`). Halaman peserta pernah diperiksa tanpa overflow horizontal pada 1920px, 768px, 375px, dan 320px. Perubahan login/admin terbaru belum diperiksa di browser; status ini bukan hasil verifikasi visual.
