# EcoSort — Smart IoT Waste Monitoring Dashboard & ESP32 Integration

Dashboard web modern dengan tema hijau Creativilo (Pixel-Perfect) untuk memonitor tong sampah pintar berbasis mikrokontroler ESP32 (MicroPython dengan sensor berat Load Cell HX711 & sensor jarak ultrasonik HC-SR04).

---

## 📁 Struktur Proyek

```text
IOT AKBAR/
├── index.js                  ← Entry point server untuk hosting Pterodactyl
├── package.json              ← 100% Pure JavaScript dependencies (bcryptjs, express, dll)
├── codeesp.py                ← Firmware ESP32 MicroPython (Load Cell HX711 & HC-SR04)
├── .env.example              ← Template variabel lingkungan server
├── README.md                 ← Panduan lengkap arsitektur & deployment
├── server/
│   ├── index.js              ← Express server utama
│   ├── middleware/
│   │   └── auth.js           ← Autentikasi JWT (Cookie httpOnly) & Token ESP32
│   ├── routes/
│   │   ├── iot.js            ← Endpoint /api/iot (telemetri, antrean perintah, riwayat, analitik)
│   │   ├── ai.js             ← Endpoint /api/ai (chat asisten & telemetri lokal)
│   │   └── auth.js           ← Endpoint /api/auth (login, rate-limit, ganti password)
│   └── data/                 ← Database JSON terisolasi (.gitkeep, diabaikan git)
└── public/
    ├── index.html            ← Dashboard EcoSort (Responsive Desktop, Tablet, Smartphone)
    ├── login.html            ← Halaman login aman bertema EcoSort
    ├── css/
    │   └── style.css         ← Styling visual pixel-perfect, responsive grid & empty states
    ├── js/
    │   ├── app.js            ← Logika aplikasi, live search, 6 kolom laporan, polling jujur
    │   └── chart.js          ← Chart.js (Spline riwayat berat, Donut 2-segmen, Analitik)
    └── images/
        └── avatar.svg        ← Avatar foto profil sesuai desain
```

---

## 🔒 Keamanan, Token & Autentikasi

1. **Password Administrator Awal:**
   - Server membaca password awal dari environment variable `ADMIN_PASSWORD`.
   - **Jika kosong**: Server secara otomatis membuat password acak sekali saat startup pertama dan mencetaknya ke konsol server (tidak pernah dikirim ke web). User diwajibkan segera mengganti password saat login pertama kali (`mustChangePassword`).
2. **Perlindungan Brute-Force Rate Limiting:**
   - Maksimal 5 kali percobaan login salah per 15 menit per alamat IP. Jika terlampaui, IP diblokir sementara dengan HTTP status 429.
3. **Penyimpanan Sesi Aman:**
   - Sesi disimpan menggunakan cookie `httpOnly` dengan atribut `SameSite=Lax` dan umur 24 jam (mencegah pencurian token via script XSS).
4. **Token Perangkat ESP32:**
   - Token perangkat **HANYA** dibaca dari environment variable `DEVICE_TOKEN`.
   - Tidak ada token rahasia yang di-hardcode di kode server, kode ESP32, maupun dokumentasi.
   - Halaman **Akun & Pengaturan** menyensor tampilan token (`eco_••••••••••••`) dan menyediakan tombol **Salin Token**.
5. **Mode Demo:**
   - Tombol *Muat Data Demo* dan *Reset Data Kosong* hanya aktif dan muncul bila environment variable `DEMO_MODE=1`.
   - Tombol reset mewajibkan pengetikan kata konfirmasi `"RESET"`.

---

## 🤝 Panduan Upload Hosting & Berdampingan dengan CCTV Relay

Jika pada panel hosting Anda (misalnya Pterodactyl di `panel.hostingin.net`) sudah berjalan aplikasi **"NEXA HOME MULTI-CAMERA CCTV RELAY"**, ikuti panduan berikut agar EcoSort dapat berjalan berdampingan tanpa merusak relay CCTV yang sudah ada:

### 1. Langkah Wajib: Backup File Sebelum Upload
Sebelum mengunggah atau mengekstrak file apa pun ke panel:
1. Buka tab **File Manager** di panel server Anda.
2. Centang semua file dan folder yang ada saat ini (terutama `index.js`, konfigurasi kamera CCTV, dan folder relay CCTV).
3. Klik tombol **Archive** (atau **Compress**) untuk membuat file arsip `backup-cctv-sebelum-ecosort.zip`.
4. Unduh file zip backup tersebut ke komputer lokal Anda sebagai cadangan aman.

---

### 2. Dua Opsi Menjalankan Berdampingan

#### OPSI A: Menjalankan di Port Terpisah (Paling Bersih & Direkomendasikan)
Gunakan opsi ini jika server Anda memiliki alokasi port tambahan di panel:
1. Alokasikan port kedua di tab **Network** / **Allocations** (misalnya CCTV di port `40120`, EcoSort di port `40122`).
2. Simpan folder EcoSort di subdirektori (misalnya `/ecosort`).
3. Jalankan EcoSort sebagai proses background terpisah atau konfigurasi environment `PORT=40122`.

#### OPSI B: Menggabungkan dalam Satu Proses Express (Satu Port untuk Semua)
Jika server Anda hanya memiliki satu alokasi port (misalnya `40122`), Anda dapat menggabungkan rute EcoSort ke dalam file `index.js` server CCTV yang sudah ada tanpa menimpa logika CCTV.

Cukup tambahkan baris berikut ke dalam Express app server Anda:
```javascript
// ---- Mounting Rute EcoSort IoT Dashboard ----
const iotRoutes = require('./server/routes/iot');
const authRoutes = require('./server/routes/auth');
const aiRoutes = require('./server/routes/ai');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Static files dashboard EcoSort
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints EcoSort
app.use('/api/iot', iotRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

// Fallback dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint CCTV Relay Anda tetap berjalan normal di route lainnya:
// app.get('/api/camera/stream', cctvStreamHandler);
```

---

### 3. Dependensi 100% Pure JavaScript (Bebas Build Error)
Semua dependensi proyek ini adalah murni JavaScript standar tanpa binary C++ (tidak memerlukan `node-gyp`, compiler Python, atau build tools):
- `bcryptjs`: Hashing kata sandi murni JavaScript (pengganti `bcrypt` native yang sering gagal compile di container hosting).
- `express`: Framework server HTTP ringan dan stabil.
- `jsonwebtoken`: Pembuatan dan verifikasi token JWT.
- `uuid`: Pembuat ID unik untuk antrean perintah mikrokontroler.

Proyek ini telah diverifikasi berjalan bersih dengan instalasi standar:
```bash
npm install
node index.js
```

---

## ⚙️ Variabel Lingkungan (.env)

Buat file `.env` di direktori utama server hosting Anda:

```env
# Port server (default hosting)
PORT=40122

# Password awal Administrator (opsional, jika kosong server buatkan acak)
ADMIN_PASSWORD=

# Token rahasia autentikasi mikrokontroler ESP32
DEVICE_TOKEN=masukkan_token_rahasia_anda_disini

# Aktifkan tombol Data Demo di halaman Akun (1 = ya, 0 = tidak)
DEMO_MODE=0

# Secret signing key JWT
JWT_SECRET=ecosort-secure-jwt-key-2024
```

---

## 🔌 Konfigurasi ESP32 (codeesp.py)

Buka file `codeesp.py` di Thonny IDE atau text editor favorit Anda:
```python
WIFI_SSID = "NAMA_WIFI_ANDA"
WIFI_PASSWORD = "PASSWORD_WIFI_ANDA"

# Alamat server hosting Anda
SERVER_URL = "http://144.79.202.196:40122/api/iot/data"
COMMAND_URL = "http://144.79.202.196:40122/api/iot/commands"

# Salin token dari halaman Akun & Pengaturan di Dashboard Anda:
DEVICE_TOKEN = "ISI_TOKEN_DARI_PANEL"
```
Simpan file tersebut ke root penyimpanan internal ESP32 sebagai `main.py` agar otomatis berjalan saat mikrokontroler dinyalakan.

---

## 📊 Karakteristik Keadaan Jujur (Honest State)

- **Saat Offline / Belum Ada Data:**
  - Kartu Metrik Donut & Kapasitas Tong menampilkan `--` dengan cincin abu-abu netral (bukan `0%`).
  - Grafik Spline Berat & Grafik Analitik menampilkan tulisan **"Belum ada data"** di tengah kartu tanpa garis nol datar atau badge mengambang yang menempel.
- **Donut Kapasitas Tong:**
  - Tepat terdiri dari 2 segmen: **Terisi** (hijau `#74c718`) dan **Kosong** (oranye `#fbbf24`) yang totalnya 100%.
- **Live Search Dashboard:**
  - Kolom pencarian *"Cari data..."* memfilter baris riwayat secara langsung dan instan.
- **Tabel Laporan 6 Kolom Sejajar:**
  - Urutan kolom: `ID Kejadian` | `Waktu Lengkap` | `Jenis / Aksi` | `Nilai Berat` | `Jarak Sensor` | `Status`.
- **Statistik Analitik Murni:**
  - Rata-rata berat, beban puncak, frekuensi buang, dan jam tersibuk dihitung **hanya dari kejadian penimbangan**, bukan dari perintah administratif.
- **Siklus Perintah Terverifikasi:**
  - Perintah baru berstatus `Menunggu`.
  - Status perintah hanya berubah menjadi `Selesai` setelah benar-benar diambil dan dieksekusi oleh ESP32 melalui endpoint `/api/iot/commands`.
  - Jika tidak diambil dalam 120 detik, perintah secara otomatis kedaluwarsa (`Kedaluwarsa`).
