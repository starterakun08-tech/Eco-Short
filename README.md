# EcoSort IoT Dashboard

Dashboard monitoring & kontrol perangkat IoT EcoSort (sensor berat HX711 + ultrasonik) berbasis ESP32 (MicroPython).

## 📁 Struktur Proyek

```
IOT AKBAR/
├── codeesp.py              ← Kode ESP32 (MicroPython) yang sudah dimodifikasi
├── package.json             ← Dependensi Node.js
├── README.md
├── server/
│   ├── index.js             ← Entry point server
│   ├── routes/
│   │   ├── iot.js           ← API endpoint IoT (data & perintah)
│   │   └── auth.js          ← API login/verifikasi
│   ├── middleware/
│   │   └── auth.js          ← Middleware autentikasi
│   └── data/                ← Otomatis dibuat saat server berjalan
└── public/
    ├── index.html           ← Dashboard utama
    ├── login.html           ← Halaman login
    ├── css/style.css        ← Stylesheet
    └── js/
        ├── app.js           ← Logika dashboard
        └── chart.js         ← Grafik sensor
```

## 🚀 Cara Upload ke Panel Hostingin (Pterodactyl)

### 1. Upload File
1. Buka panel di `panel.hostingin.net`, pilih server kamu.
2. Klik tab **Files**.
3. Upload **semua** file & folder (`server/`, `public/`, `package.json`) ke direktori root (`/home/container/`).
   - Atau gunakan SFTP jika tersedia.

### 2. Atur Startup
1. Klik tab **Startup**.
2. Pada **Main File** (atau `MAIN_FILE`), isi: `server/index.js`
3. Pastikan **Node.js Version** = `24` (atau biarkan default).

### 3. Install Dependensi
1. Klik tab **Console**.
2. Ketik restart / klik **Restart**. 
3. Pterodactyl akan otomatis menjalankan `npm install` saat startup (lihat skrip startup di console).
4. Setelah selesai, di console akan muncul:
   ```
   ========================================
     NEXA HOME MULTI-CAMERA CCTV RELAY AKTIF
     ECOSORT IoT Dashboard AKTIF
     - Port : 40122
   ========================================
   ```

### 4. Akses Dashboard
- Buka browser: `http://144.79.202.196:40122/`
- Login default:
  - **Username**: `admin`
  - **Password**: `ecosort2024`

## 🔌 Cara Upload codeesp.py ke ESP32

### Prasyarat
- ESP32 dengan firmware MicroPython
- Library `hx711.py` sudah ada di ESP32
- Thonny IDE (atau ampy/mpremote)

### Langkah
1. Buka **Thonny** → Pilih interpreter **MicroPython (ESP32)**.
2. Buka file `codeesp.py`.
3. Sesuaikan jika perlu:
   - `WIFI_SSID` dan `WIFI_PASSWORD` → WiFi yang bisa akses internet.
   - `SERVER_URL` sudah diisi `http://144.79.202.196:40122/api/iot/data`.
   - `DEVICE_TOKEN` harus sama dengan yang di server (`ecosort-secret-2024`).
4. Klik **Save as** → pilih **MicroPython device** → simpan sebagai `main.py`.
5. Reset ESP32. ESP akan otomatis connect WiFi dan mulai kirim data.

## 🧪 Cara Tes Koneksi

### Tes dari laptop (simulasi ESP):
```bash
# Kirim data sensor dummy
curl -X POST http://144.79.202.196:40122/api/iot/data \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: ecosort-secret-2024" \
  -d '{"deviceId":"esp32-ecosort-1","weightGram":150.5,"totalWeightGram":300.0,"distanceCm":20.3,"fullThresholdCm":10,"emptyDistanceCm":35}'

# Cek perintah (seperti yang dilakukan ESP)
curl http://144.79.202.196:40122/api/iot/commands?deviceId=esp32-ecosort-1 \
  -H "X-Device-Token: ecosort-secret-2024"
```

### Tes login dashboard:
```bash
curl -X POST http://144.79.202.196:40122/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ecosort2024"}'
```

## 📝 Perubahan di codeesp.py

Berikut bagian yang **diubah/ditambah** dari kode ESP asli (ditandai komentar `[DIUBAH]` dan `[DITAMBAH]`):

| Baris | Perubahan | Keterangan |
|-------|-----------|------------|
| 21 | `SERVER_URL` | Diubah ke `http://144.79.202.196:40122/api/iot/data` |
| 23-25 | `COMMAND_URL`, `DEVICE_TOKEN` | Ditambah: URL endpoint perintah & token autentikasi |
| 53-55 | `command_poll_counter`, `COMMAND_POLL_EVERY` | Ditambah: counter untuk polling perintah |
| 196-198 | Header di `send_to_dashboard()` | Ditambah: header `X-Device-Token` pada HTTP POST |
| 207-251 | `poll_and_execute_commands()` | Ditambah: fungsi baru untuk mengambil & eksekusi perintah |
| 278-281 | Loop utama | Ditambah: panggil `poll_and_execute_commands()` tiap 5 siklus kirim |

**Yang TIDAK diubah**: semua logika sensor, kalibrasi, smoothing, konfigurasi pin, WiFi, dan format tampilan serial.

## 🔐 Keamanan

- Dashboard dilindungi JWT (expired 24 jam)
- ESP menggunakan token `X-Device-Token` untuk autentikasi
- Default password: `ecosort2024` — **ganti setelah deploy!**

## ⚙️ Environment Variables (opsional)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `PORT` / `SERVER_PORT` | `40122` | Port server |
| `JWT_SECRET` | `ecosort-jwt-secret-key-2024` | Secret untuk JWT |
| `DEVICE_TOKEN` | `ecosort-secret-2024` | Token autentikasi ESP |

