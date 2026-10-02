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

## Membuat shell Wails (dijalankan sendiri)

1. Pasang CLI dan cek prasyarat:
   ```
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   wails doctor
   ```
2. Dari folder utama proyek:
   ```
   wails init -n valve-database-desktop -t vanilla -d desktop
   ```
3. Di `desktop/go.mod` tambahkan:
   ```
   require valve_database v0.0.0
   replace valve_database => ../backend
   ```
   lalu `go mod tidy` di `desktop/`.
4. Hapus `desktop/frontend/` bawaan template. Di `desktop/main.go`, sketsa
   (nama field persis harus dicocokkan dengan versi Wails yang terpasang):
   ```go
   distFS, _ := fs.Sub(assets.Frontend, "frontend_dist")
   router, cleanup, err := server.New(distFS)
   // ...
   wails.Run(&options.App{
       Title:      "Valve Database",
       AssetServer: &assetserver.Options{Handler: router},
       OnShutdown: func(ctx context.Context) { cleanup() },
   })
   ```
5. `backend\build-frontend.bat`, lalu `cd desktop && wails build`. Hasilnya satu
   `.exe` di `desktop/build/bin/`.

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
