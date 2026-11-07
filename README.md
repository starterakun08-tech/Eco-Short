# Creativilo — EcoSort IoT Dashboard & ESP32 Integration

Dashboard web modern dengan tema hijau (Pixel-Perfect mengikuti desain Creativilo) untuk memonitor tong sampah pintar berbasis ESP32 (MicroPython dengan sensor berat HX711 & sensor jarak ultrasonik).

---

## 📁 Struktur Proyek

```text
IOT AKBAR/
├── index.js                  ← Entry point root untuk Hostingin (Pterodactyl)
├── package.json              ← Dependensi Node.js (express, jsonwebtoken, bcryptjs, dll)
├── codeesp.py                ← Firmware ESP32 MicroPython
├── README.md                 ← Panduan lengkap ini
├── server/
│   ├── index.js              ← Express server utama (Port 40122)
│   ├── middleware/
│   │   └── auth.js           ← Autentikasi JWT & Device Token (X-Device-Token)
│   ├── routes/
│   │   ├── iot.js            ← Endpoint /api/iot (data, commands, history, transactions)
│   │   └── auth.js           ← Endpoint /api/auth (login & session)
│   └── data/                 ← Penyimpanan data JSON ringan (users, history, commands)
└── public/
    ├── index.html            ← Halaman utama Dashboard Creativilo (Layout 3 kolom)
    ├── login.html            ← Halaman login bertema serasi
    ├── css/
    │   └── style.css         ← Styling visual pixel-perfect (gradien hijau, panel gelap)
    ├── js/
    │   ├── app.js            ← Logika dashboard, polling real-time, kontrol perintah
    │   └── chart.js          ← Grafik Revenue (Spline) & Customers (Donut)
    └── images/
        └── avatar.svg        ← Avatar foto profil melingkar sesuai desain
```

---

## 🚀 Cara Upload ke Panel Hostingin (Pterodactyl)

### 1. Upload File ZIP / Folder
1. Buka panel di `panel.hostingin.net` dan pilih server kamu.
2. Buka tab **Files**.
3. Upload file `ecosort-upload.zip` (atau seluruh file proyek: `index.js`, `package.json`, `server/`, `public/`).
4. Jika mengupload file ZIP: klik titik tiga di sebelah file `ecosort-upload.zip` lalu pilih **Unarchive**.

### 2. Konfigurasi Menu Startup
1. Buka tab **Startup** di panel Hostingin.
2. Pada kolom **Main File** (atau `MAIN_FILE`), pastikan terisi:
   ```text
   index.js
   ```
3. Pastikan **Node.js Version** adalah `24`.

### 3. Jalankan Server
1. Masuk ke tab **Console** di panel.
2. Klik tombol **Restart** (atau **Start**).
3. Pterodactyl akan membaca dependensi dan menjalankan server. Di console akan muncul banner resmi:
   ```text
   ========================================
     NEXA HOME MULTI-CAMERA CCTV RELAY AKTIF
     ECOSORT IoT Dashboard AKTIF
     - Port : 40122
   ========================================
   ```

### 4. Akses Dashboard
- Buka di browser: `http://144.79.202.196:40122/` (atau `http://localhost:40122/` di lokal).
- Akun default:
  - **Username**: `admin`
  - **Password**: `ecosort2024`

---

## 🔌 Catatan Firmware ESP32 (codeesp.py)

- Firmware ESP32 tetap menggunakan **MicroPython**.
- **Perbaikan bug sintaks:** Pada loop utama baris 311, trailing koma pada `jarak_raw = read_distance_cm(),` telah dihapus agar mengembalikan nilai `float` murni (bukan `tuple`), sehingga perhitungan filter EMA dan persentase kapasitas berjalan normal tanpa error.
- ESP32 berkomunikasi via HTTP POST ke `/api/iot/data` dan polling perintah via GET ke `/api/iot/commands` menggunakan header autentikasi `X-Device-Token: ecosort-secret-2024`.

---

## 🧪 Cara Tes Koneksi & Simulasi

### 1. Tes Kirim Data Sensor (Simulasi dari Terminal):
```bash
curl -X POST http://144.79.202.196:40122/api/iot/data \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: ecosort-secret-2024" \
  -d '{
    "deviceId": "esp32-ecosort-1",
    "weightGram": 245.5,
    "totalWeightGram": 1820.0,
    "currentWeightGram": 245.5,
    "distanceCm": 21.4,
    "fullThresholdCm": 10,
    "emptyDistanceCm": 35,
    "resetWeight": false
  }'
```

### 2. Tes Ambil Antrean Perintah (Sebagaimana Dilakukan ESP32):
```bash
curl "http://144.79.202.196:40122/api/iot/commands?deviceId=esp32-ecosort-1" \
  -H "X-Device-Token: ecosort-secret-2024"
```

### 3. Tes Login Dashboard:
```bash
curl -X POST http://144.79.202.196:40122/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ecosort2024"}'
```
