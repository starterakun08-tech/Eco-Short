# EcoSort — Smart IoT Waste Monitoring Dashboard & ESP32 Integration

Dashboard web modern dengan tema hijau (Pixel-Perfect mengikuti desain Creativilo) untuk memonitor tong sampah pintar berbasis mikrokontroler ESP32 (MicroPython dengan sensor berat HX711 & sensor jarak ultrasonik HC-SR04).

---

## 📁 Struktur Proyek

```text
IOT AKBAR/
├── index.js                  ← Entry point root server untuk hosting (Pterodactyl / VPS / Lokal)
├── package.json              ← Dependensi 100% Pure JS (express, jsonwebtoken, bcryptjs, dll)
├── codeesp.py                ← Firmware ESP32 MicroPython (Load Cell HX711 & Ultrasonik HC-SR04)
├── README.md                 ← Panduan lengkap ini
├── server/
│   ├── index.js              ← Express server utama (Port 40122)
│   ├── middleware/
│   │   └── auth.js           ← Autentikasi JWT & Device Token ESP32 (X-Device-Token)
│   ├── routes/
│   │   ├── iot.js            ← Endpoint /api/iot (data, commands, history, transactions, analytics, export)
│   │   ├── ai.js             ← Endpoint /api/ai (chat cerdas & Gemini 1.5 Flash integration)
│   │   └── auth.js           ← Endpoint /api/auth (login, session, profil, password)
│   └── data/                 ← Penyimpanan data JSON ringan (users, history, commands, device_token)
└── public/
    ├── index.html            ← Halaman utama Dashboard EcoSort (Responsive Desktop, Tablet, HP)
    ├── login.html            ← Halaman login bertema serasi EcoSort
    ├── css/
    │   └── style.css         ← Styling visual pixel-perfect (gradien hijau, panel gelap, responsive layout)
    ├── js/
    │   ├── app.js            ← Logika aplikasi, navigasi multi-view, polling real-time, kontrol perintah
    │   └── chart.js          ← Inisialisasi Chart.js (Spline riwayat berat, Donut kapasitas, Analitik per jam)
    └── images/
        └── avatar.svg        ← Avatar foto profil melingkar sesuai desain
```

---

## 🌟 Fitur Utama Dashboard

1. **Dashboard Utama (Live & Jujur):**
   - 3 Kartu Banner Hijau: Berat Sensor (`currentWeightGram`), Jarak Sensor (`distanceCm`), dan Status Sampah (`AMAN` / `PENUH` / `SENSOR ERROR`).
   - Indikator Status Jujur: Saat ESP32 aktif terhubung menampilkan label `Live`. Saat perangkat offline menampilkan nilai terakhir dengan jam tepat (`Terakhir 14.28`). Jika belum ada data menampilkan `--`.
   - Grafik Spline Riwayat Berat: Sumbu X format jam (`08:00`, `10:00`, dsb.) dan dataset `Kemarin` hanya muncul jika data historis kemarin benar-benar ada.
   - Donut Persentase Kapasitas: Skala otomatis terisi vs kosong berdasarkan kalibrasi tinggi tong.
   - Tabel Riwayat Penimbangan & Perintah (4 baris terkini dengan badge status).
   - Panel Profil Kanan: Foto avatar, status online/offline, kapasitas tong terisi, akumulasi berat sampah, dan tombol kontrol cepat Tare.

2. **Asisten AI Pintar (`#ai`):**
   - Kartu chat penuh selebar area utama dengan bar status perangkat live di atas.
   - Tombol pertanyaan instan: "Apakah tong sudah penuh?", "Ringkas data hari ini", "Berapa berat saat ini?", "Cek status perangkat".
   - Integrasi langsung Google Gemini 1.5 Flash via `GEMINI_API_KEY`.
   - Mode Cerdas Otomatis: Jika API key belum dipasang, asisten tetap dapat menjawab secara cerdas berdasarkan telemetri sensor lokal.

3. **Halaman Analitik Lengkap (`#analytics`):**
   - Pilihan rentang waktu: "Hari ini" dan "7 Hari".
   - 4 Kartu Metrik Riset: Rata-rata Berat, Beban Puncak (Peak), Frekuensi Buang Sampah, dan Jam Tersibuk.
   - 2 Grafik Chart.js responsif: Riwayat Berat per Jam dan Tingkat Isi Tong dari Waktu ke Waktu.

4. **Halaman Laporan & Ekspor Data (`#reports`):**
   - 3 Kartu Ringkasan: Total Berat Terkumpul, Jumlah Kejadian Log, dan Status Perangkat.
   - Tombol **Ekspor CSV** dan **Ekspor JSON** langsung unduh dari browser.
   - Tabel log aktivitas lengkap dengan scroll internal di dalam kartu.

5. **Kontrol Mikrokontroler Modal (`#kontrol`):**
   - Eksekusi Tare / Nol Timbangan jarak jauh.
   - Kalibrasi faktor Load Cell HX711.
   - Pengaturan interval transmisi telemetri (1–60 detik).
   - Perintah remote Restart ESP32.
   - Keamanan antrean: Perintah kedaluwarsa otomatis dalam 120 detik, pencegahan antrean ganda (max 1 pending per jenis).

6. **Akun & Pengaturan (`#account`):**
   - Pembaruan nama profil dan ganti password administrator.
   - Informasi koneksi port 40122 dan status ESP32.
   - Salin **Device Token** dengan 1-klik untuk dipasang pada `codeesp.py`.
   - Tombol **Muat Data Demo** dan **Reset Data Kosong** untuk pengujian fleksibel.

---

## 📱 Responsif di Semua Ukuran Layar

- **Monitor Besar (≥ 1440px):** Layout 3 kolom lega proporsional dengan max-width 1800px terpusat.
- **Laptop Standar (1024px – 1439px):** Layout 3 kolom adaptif setinggi satu layar (100dvh) tanpa scrollbar halaman luar.
- **Tablet (768px – 1023px):** Sidebar mengecil menjadi icon rail; panel profil dan kartu Earning berpindah ke bawah tersusun berdampingan (2 kolom).
- **HP / Smartphone (< 768px):** 1 kolom vertikal alami; navigasi berubah menjadi bottom navigation bar dengan padding safe-area iPhone; panel profil hanya muncul di dashboard bawah; halaman AI, Analitik, dan Laporan tampil penuh tanpa tumpang tindih.

---

## 🚀 Cara Upload ke Panel Hostingin (Pterodactyl)

### 1. Upload File ZIP / Folder
1. Buka panel di `panel.hostingin.net` dan pilih server kamu.
2. Buka tab **Files**.
3. Upload file `ecosort-upload.zip`.
4. Klik titik tiga di sebelah file `ecosort-upload.zip` lalu pilih **Unarchive**.

### 2. Konfigurasi Menu Startup & Variabel Lingkungan
1. Buka tab **Startup** di panel Hostingin.
2. Pada kolom **Main File** (atau `MAIN_FILE`), pastikan terisi:
   ```text
   index.js
   ```
3. Pastikan **Node.js Version** adalah `24` atau versi LTS yang tersedia.
4. **Environment Variables (Opsional):**
   - `DEVICE_TOKEN`: Token rahasia komunikasi ESP32 (default jika kosong: `eco_dc6a6db1e6d53577c8693a426173906a`).
   - `GEMINI_API_KEY`: API key Google Gemini Anda dari [Google AI Studio](https://aistudio.google.com/) untuk mengaktifkan AI generatif cloud.

### 3. Jalankan Server
1. Masuk ke tab **Console** di panel.
2. Klik tombol **Restart** (atau **Start**).
3. Di console akan muncul banner resmi:
   ```text
   ========================================
     NEXA HOME MULTI-CAMERA CCTV RELAY AKTIF
     ECOSORT IoT Dashboard AKTIF
     - Port : 40122
   ========================================
   ```

### 4. Akses Dashboard
- Buka di browser: `http://144.79.202.196:40122/` (atau `http://localhost:40122/`).
- Akun default:
  - **Username**: `admin`
  - **Password**: `ecosort2024`

---

## 🔌 Konfigurasi ESP32 (codeesp.py)

Buka file `codeesp.py` di Thonny IDE atau text editor, sesuaikan konfigurasi jaringan Anda:
```python
WIFI_SSID = "NAMA_WIFI_KAMU"
WIFI_PASSWORD = "PASSWORD_WIFI_KAMU"

SERVER_URL = "http://144.79.202.196:40122"
DEVICE_TOKEN = "eco_dc6a6db1e6d53577c8693a426173906a"
```
Simpan ke ESP32 sebagai `main.py` agar otomatis berjalan saat mikrokontroler dinyalakan.

---

## 🧪 Pengujian API (cURL)

### Kirim Data Sensor ESP32:
```bash
curl -X POST http://localhost:40122/api/iot/data \
  -H "Content-Type: application/json" \
  -H "X-Device-Token: eco_dc6a6db1e6d53577c8693a426173906a" \
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

### Ambil Antrean Perintah ESP32:
```bash
curl "http://localhost:40122/api/iot/commands?deviceId=esp32-ecosort-1" \
  -H "X-Device-Token: eco_dc6a6db1e6d53577c8693a426173906a"
```
