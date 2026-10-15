param([switch]$HanyaExe)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root

function Step($msg) { Write-Host ""; Write-Host "=== $msg ===" -ForegroundColor Cyan }

Step '1/5 Cek prasyarat'
foreach ($c in 'go', 'node', 'npm', 'wails') {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Perintah '$c' tidak ditemukan di PATH." }
}

Step '2/5 Build frontend'
& cmd /c "call backend\build-frontend.bat"
if ($LASTEXITCODE -ne 0) { throw 'backend\build-frontend.bat gagal.' }

Step '3/5 Build aplikasi (Wails)'
Push-Location (Join-Path $root 'desktop')
try {
    & wails build -s -skipbindings
    if ($LASTEXITCODE -ne 0) { throw 'wails build gagal.' }
} finally { Pop-Location }
$exe = Join-Path $root 'desktop\build\bin\ValveDatabase.exe'
if (-not (Test-Path $exe)) { throw "Hasil build tidak ditemukan: $exe" }
if (((Get-Date) - (Get-Item $exe).LastWriteTime).TotalMinutes -gt 10) {
    throw 'ValveDatabase.exe tidak diperbarui oleh build ini (usia file lebih dari 10 menit).'
}

if ($HanyaExe) {
    # Mode update: hanya exe baru, untuk ditimpa ke IPC yang sudah berjalan
    $upd = Join-Path $root ('OUTPUTS\Test-Bench-Report-Generator\Update_IPC_' + (Get-Date -Format 'yyMMdd_HHmm'))
    New-Item -ItemType Directory -Path $upd -Force | Out-Null
    Copy-Item $exe $upd
    Write-Host ""
    Write-Host "SELESAI: $upd\ValveDatabase.exe" -ForegroundColor Green
    Write-Host "Tutup aplikasi di IPC, lalu timpa ValveDatabase.exe saja. Jangan timpa data.db dan .env."
    return
}

Step '4/5 Rakit folder paket'
$stage = Join-Path $env:TEMP ('vdb_ipc_' + [guid]::NewGuid().ToString('N'))
$pkg = Join-Path $stage 'ValveDatabase_IPC'
New-Item -ItemType Directory -Path $pkg, (Join-Path $pkg 'images'), (Join-Path $pkg 'datasheets') | Out-Null
Copy-Item $exe $pkg
Set-Content -Path (Join-Path $pkg 'images\.keep') -Value '' -Encoding ASCII
Set-Content -Path (Join-Path $pkg 'datasheets\.keep') -Value '' -Encoding ASCII

# .env baru dengan rahasia acak. Tanpa BOM, karena BOM merusak pembacaan kunci pertama.
function New-Secret([int]$len) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] $len
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}
$jwtBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
$jwt = -join ($jwtBytes | ForEach-Object { $_.ToString('x2') })
$envText = "ADMIN_PASSWORD=$(New-Secret 14)`r`nOPERATOR_PASSWORD=$(New-Secret 14)`r`nJWT_SECRET=$jwt`r`n"
[IO.File]::WriteAllText((Join-Path $pkg '.env'), $envText, (New-Object Text.UTF8Encoding($false)))

# Panduan: isi tanggal dan commit saat build
$commit = 'tidak diketahui'
try { $c = (& git rev-parse --short HEAD 2>$null); if ($c) { $commit = $c } } catch { }
$guide = Get-Content (Join-Path $PSScriptRoot 'BACA_DULU.txt') -Raw -Encoding UTF8
$guide = $guide.Replace('{TANGGAL}', (Get-Date -Format 'dd.MM.yyyy')).Replace('{COMMIT}', $commit)
[IO.File]::WriteAllText((Join-Path $pkg 'BACA_DULU.txt'), $guide, (New-Object Text.UTF8Encoding($true)))

Step '5/5 Zip'
$outDir = Join-Path $root 'OUTPUTS\Test-Bench-Report-Generator'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$name = (Get-Date -Format 'yyMMdd') + '_Paket_IPC_ValveDatabase_ID.zip'
$zip = Join-Path $outDir $name
if (Test-Path $zip) {
    # jangan menimpa paket yang sudah ada: beri akhiran jam-menit
    $name = (Get-Date -Format 'yyMMdd') + '_Paket_IPC_ValveDatabase_' + (Get-Date -Format 'HHmm') + '_ID.zip'
    $zip = Join-Path $outDir $name
}
Compress-Archive -Path $pkg -DestinationPath $zip
Remove-Item -Recurse -Force $stage

# Pastikan isi zip lengkap sebelum dilaporkan selesai
Add-Type -AssemblyName System.IO.Compression.FileSystem
$za = [IO.Compression.ZipFile]::OpenRead($zip)
try { $entries = $za.Entries | ForEach-Object { $_.FullName } } finally { $za.Dispose() }
foreach ($need in 'ValveDatabase.exe', '.env', 'BACA_DULU.txt') {
    if (-not ($entries | Where-Object { $_ -like "*$need" })) { throw "Zip tidak lengkap, '$need' tidak ada di dalamnya." }
}

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "SELESAI: $zip ($mb MB)" -ForegroundColor Green
Write-Host "Pindahkan zip ke IPC, ekstrak, lalu ikuti BACA_DULU.txt di dalamnya."
Write-Host "Untuk UPDATE IPC yang sudah berjalan: cukup salin desktop\build\bin\ValveDatabase.exe (jangan timpa data.db dan .env)."
