# 📹 EcoSort CCTV — Aplikasi Kamera Pemantau Sampah Berbasis Flutter

Aplikasi mobile CCTV cerdas yang dirancang untuk memantau kebersihan area di sekitar tong sampah **EcoSort IoT** secara real-time menggunakan kamera smartphone atau perangkat CCTV.

---

## 🌟 Fitur Utama

1. **Analisis AI Cerdas (Google Gemini Vision):**
   - Mengambil frame gambar dari kamera CCTV dan menganalisis area sekitar tong sampah.
   - **Aturan Radius 2 Meter:** Hanya sampah dalam radius maksimal 2 meter dari tong sampah yang dianalisis. Sampah yang berjarak lebih dari 2 meter (misalnya jauh di seberang atau di tengah jalan raya/aspal) secara otomatis diabaikan.
2. **3 Status Lingkungan Real-Time:**
   - 🟢 **Bersih (0 Sampah):** Status "Bersih", indikator warna Hijau.
   - 🟡 **Waspada (1 - 5 Sampah):** Status "Waspada", indikator warna Kuning, menyebutkan estimasi jumlah sampah berserakan.
   - 🔴 **Kotor (> 5 Sampah):** Status "Kotor", indikator warna Merah, menyebutkan estimasi jumlah sampah dan **mengirimkan peringatan darurat ke Petugas Kebersihan**.
3. **Target Area HUD Overlay:**
   - Menampilkan lingkaran target radius 2 meter di atas layar kamera sebagai panduan area inspeksi.
4. **Auto-Capture & Manual Snapshot:**
   - Tombol manual: Ambil & Analisa langsung.
   - Mode otomatis (Timer): Mengambil dan menganalisis frame setiap 10 detik (dapat diatur 5 - 60 detik).
5. **Kontrol Kamera Lengkap:**
   - Tombol Senter (Flashlight / Torch) untuk malam hari.
   - Ganti kamera depan / belakang (Flip Camera).
6. **Sinkronisasi Otomatis:**
   - Hasil deteksi langsung mengupdate status kotak banner di dashboard website EcoSort secara instan.

---

## 🚀 Panduan Menjalankan Aplikasi Flutter

### Langkah 1: Persiapan Flutter SDK (Jika Belum Terinstal)
1. Unduh Flutter SDK untuk Windows dari situs resmi:
   👉 **https://docs.flutter.dev/get-started/install/windows**
2. Ekstrak folder `flutter` ke `C:\src\flutter` (atau direktori pilihan Anda).
3. Tambahkan direktori `C:\src\flutter\bin` ke dalam **Environment Variables (PATH)** Windows.
4. Buka Terminal/PowerShell baru dan verifikasi:
   ```bash
   flutter doctor
   ```

### Langkah 2: Menjalankan Aplikasi CCTV
Masuk ke direktori `cctv_app` dan jalankan:
```bash
cd cctv_app
flutter pub get
flutter run
```
*Atau klik dua kali file `run_app.bat` di dalam folder ini.*

---

## ⚙️ Pengaturan Koneksi Server

Buka menu **Pengaturan (Ikon Gerigi)** di pojok kanan atas aplikasi:
- **URL Server EcoSort:**
  - Di Android Emulator: `http://10.0.2.2:40122`
  - Di HP Fisik (WiFi yang sama): `http://<IP-Komputer-Anda>:40122` (contoh: `http://192.168.1.50:40122`)
  - Di Server Publik / Hosting: `http://<Domain-atau-IP-Server>:40122`
- **ID Perangkat:** `esp32-ecosort-1`
- **Token Autentikasi:** `eco_token_12345` (sesuai `.env` server)
- Tekan **Tes Koneksi ke Server** untuk memastikan jaringan terhubung.

---

## 📡 API Endpoint Terkait di Backend

- `POST /api/ai/analyze-cctv` : Menerima base64 gambar dari kamera CCTV, menganalisis dengan AI Gemini, dan mengupdate status lingkungan.
- `GET /api/ai/latest-cctv` : Mengambil data hasil analisis CCTV terakhir.
- `GET /api/ai/latest-cctv-image` : Mengambil file gambar snapshot CCTV terakhir.

