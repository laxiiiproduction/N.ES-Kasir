# Kasir Coffee Shop

Aplikasi kasir (POS) siap deploy sebagai website.

## Jalankan di komputer sendiri
npm install
npm run dev

## Build untuk production
npm run build
(hasil build ada di folder dist/)

## Catatan
- Data (produk, staff, transaksi, log aktivitas) disimpan di localStorage browser,
  artinya tersimpan per-perangkat/browser yang dipakai. Cocok untuk 1 meja kasir.
- Kalau nanti butuh data yang sama muncul di banyak perangkat sekaligus,
  storage ini perlu diganti ke database (misal Supabase/Firebase).
