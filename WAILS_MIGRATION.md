# Migrasi ke Wails (Industrial PC)

Status 02.10.2026: sisi Go dan frontend sudah disiapkan. Shell Wails
(`desktop/`) belum dibuat. Tahap itu butuh Wails CLI dan Go di Windows.

## Yang sudah dikerjakan (branch ini)

| Bagian | File | Isi |
|---|---|---|
| Router | `backend/internal/server/server.go` | `server.New(distFS)` mengembalikan `*gin.Engine`, fungsi cleanup, dan error. Memuat `.env`, koneksi DB, seed user, semua route `/api` (sama persis dengan `main.go` Hanif), dan fallback ke frontend untuk path selain API. |
| Entry point | `backend/main.go` | Tinggal memanggil `server.New` lalu `router.Run`. Perilaku sama: semua interface, port 8080. `APP_HOST=127.0.0.1` di `.env` membatasi ke lokal. |
| Embed frontend | `backend/assets/assets.go` | `//go:embed all:frontend_dist`. Hanya `.gitkeep` yang masuk git. |
| Build frontend | `backend/build-frontend.bat` / `.sh` | `npm run build` dengan `VITE_EMBEDDED=true`, lalu salin ke `backend/assets/frontend_dist/`. |
| API base URL | `frontend/src/services/api.js` | Build embedded memakai `/api` (satu origin). Build biasa dan `npm run dev` tidak berubah (`VITE_API_URL`, atau `http://localhost:8080/api`). |
| Ignore | `.gitignore` | `backend/tmp/` (output Air) dan isi `backend/assets/frontend_dist/`. |

Fallback frontend: path yang bukan file nyata dijawab `index.html` (Vue Router
mengambil alih). Path `/api/...`, `/images/...`, `/datasheets/...` yang tidak
cocok dijawab 404 biasa, bukan HTML.

## Yang BELUM terbukti

Go tidak bisa dikompilasi di sandbox (proxy modul diblokir). Yang sudah
dicek: `gofmt` lolos, semua fungsi yang dipanggil ada dengan signature yang
cocok, dan frontend ter-build di dua mode (URL API sudah diverifikasi di
bundle). Kompilasi dan jalannya server baru terbukti setelah kamu menjalankan
langkah di bawah.

## Uji di browser (tanpa Wails)

```
backend\build-frontend.bat
cd backend
air -c .air.windows.toml
```

Buka `http://localhost:8080`. Halaman login harus tampil dari backend, tanpa
Vite. Cek juga: refresh di `/valves`, dan `/api/ping`.
Mode pengembangan sehari-hari tidak berubah: Air di satu terminal,
`npm run dev` di terminal lain.

## Shell Wails (`desktop/`)

Dibuat dengan `wails init -n valve-database-desktop -t vanilla -d desktop`
(Wails v2.16.0), lalu `go.mod`, `main.go`, dan `wails.json` diganti.
`app.go` dan isi `frontend/` bawaan template dihapus karena tidak dipakai;
folder `frontend/` sendiri dibiarkan kosong (lihat langkah build).

- Modul bernama `valve_database/desktop` (bukan `valve-database-desktop`).
  Go hanya mengizinkan paket di bawah path `valve_database/` mengimpor
  `valve_database/internal/...`; nama modul lain ditolak compiler.
- `go.mod` memakai `replace valve_database => ../backend`.
- `main.go` memindahkan folder kerja ke folder `.exe`, lalu memanggil
  `server.New(distFS)` dan menyerahkan router Gin sebagai
  `AssetServer.Handler`. Tidak ada port TCP yang dibuka.
- `wails.json` tanpa perintah frontend. Frontend dibangun oleh
  `backend\build-frontend.bat`, bukan oleh Wails.

Build dan uji:

1. `backend\build-frontend.bat`
2. `cd desktop`, lalu `go mod tidy`
3. `wails build -s -skipbindings`. `-s` melewati build frontend, dan
   `-skipbindings` melewati pembuatan binding (tanpa itu Wails menjalankan
   binary sementara yang ikut menjalankan `server.New` dan membuat
   `data.db` di folder Temp). Folder `desktop\frontend\` harus ada
   (hanya berisi `.gitkeep`), karena Wails memeriksanya walaupun frontend
   dilewati.
4. Hasil: `desktop\build\bin\ValveDatabase.exe`. Taruh `.env` (dan
   `data.db` bila ingin data yang ada) di folder yang sama dengan `.exe`.

## Perlu diputuskan

- **Lokasi data tulis** (`data.db`, `images/`, `datasheets/`, sertifikat OPC
  UA): semuanya relatif ke folder kerja proses. Asumsi sekarang: `.exe` dan
  data berdampingan di satu folder portable di IPC. Kalau IPC harus memasang
  ke `Program Files` (read-only), data perlu diarahkan ke folder lain.
- **File `data.db-shm` / `data.db-wal`** masih ter-track di git (dari repo
  Hanif). Sebaiknya dikeluarkan dari git di repo utama.

## File sisa

- `backend/main.go.bak-ctrlxcore`: cadangan lama, aman dihapus.
- `backend/frontend_dist/`: lokasi lama sebelum embed, aman dihapus kalau kosong.
- `packaging/`: sisa snap ctrlX CORE, tidak dipakai lagi.
