"""
================================================================================
          KODE LENGKAP SEMUA SENSOR & SERVO - ECOSORT SMART TRASH CAN
                      (VERSI PERBAIKAN AKURASI VOLUME)
================================================================================
Perbaikan Akurasi:
  1. Menampilkan 'Jarak Sensor Asli' dan 'Tinggi Sampah' agar mudah dikalibrasi.
  2. Saat tutup tong membuka (180°), pembacaan sensor volume DI-FREEZE (ditahan),
     sehingga tidak membaca pantulan langit-langit/tangan saat tutup terbuka.
  3. Filter median 5 sampel untuk mencegah pantulan dinding tong.
  4. Pengaturan TINGGI DASAR TONG MANUAL yang bisa disesuaikan dengan penggaris.
================================================================================
"""
try:
    from machine import Pin, PWM, time_pulse_us  # type: ignore
except ImportError:
    # Mock / Fallback untuk VS Code / Desktop Python agar tidak muncul garis merah / error
    class Pin:
        IN = 0
        OUT = 1
        def __init__(self, pin, mode=None):
            self.pin = pin
            self.mode = mode
        def value(self, val=None):
            return 0
    class PWM:
        def __init__(self, pin, freq=50):
            self.pin = pin
            self.freq = freq
        def duty_u16(self, duty):
            pass
        def deinit(self):
            pass
    def time_pulse_us(pin, val, timeout):
        return 0

import time

# Mock untuk Desktop Python agar fungsi waktu MicroPython tidak garis merah di VS Code
if not hasattr(time, 'ticks_ms'):
    time.ticks_ms = lambda: int(time.time() * 1000)
if not hasattr(time, 'ticks_diff'):
    time.ticks_diff = lambda a, b: a - b
if not hasattr(time, 'sleep_ms'):
    time.sleep_ms = lambda ms: time.sleep(ms / 1000.0)
if not hasattr(time, 'sleep_us'):
    time.sleep_us = lambda us: time.sleep(us / 1000000.0)

# ==============================================================================
# 1. KONFIGURASI PARAMETER (SESUAIKAN DENGAN TONG ANDA)
# ==============================================================================
# Servo MG995
SERVO_PIN = 18
DUTY_TUTUP = 3276  # 0 Derajat (Tutup Rapat - 1000 us)
DUTY_BUKA  = 6553  # 180 Derajat (Buka Maksimal - 2000 us)
DURASI_BUKA_DETIK = 5

# Ultrasonik 1 (Tangan Depan)
TRIG_TANGAN_PIN = 19
ECHO_TANGAN_PIN = 21
JARAK_BUKA_TANGAN_CM = 20.0  # Buka jika tangan <= 20 cm

# Ultrasonik 2 (Volume Dalam Tong)
TRIG_VOLUME_PIN = 23
ECHO_VOLUME_PIN = 14

# --- PENTING: UKUR DENGAN PENGGARIS DARI SENSOR KE DASAR TONG KOSONG ---
# Jika Auto-Tare tidak pas, ubah angka di bawah ini sesuai tinggi tong Anda (cm):
TINGGI_DASAR_TONG_DEFAULT = 30.0  
BATAS_PENUH_CM            = 10.0  # Jika tinggi sampah >= 10.0 cm -> 🔴 PENUH

jarak_dasar_tong = TINGGI_DASAR_TONG_DEFAULT

# Load Cell HX711 (Timbangan)
HX_DT_PIN  = 4
HX_SCK_PIN = 5
FAKTOR_KALIBRASI = 423.5

# ==============================================================================
# 2. INISIALISASI HARDWARE
# ==============================================================================
servo = PWM(Pin(SERVO_PIN), freq=50)

trig_tangan = Pin(TRIG_TANGAN_PIN, Pin.OUT)
echo_tangan = Pin(ECHO_TANGAN_PIN, Pin.IN)

trig_vol = Pin(TRIG_VOLUME_PIN, Pin.OUT)
echo_vol = Pin(ECHO_VOLUME_PIN, Pin.IN)

class HX711:
    def __init__(self, d_out, pd_sck):
        self.d_out = Pin(d_out, Pin.IN)
        self.pd_sck = Pin(pd_sck, Pin.OUT)
        self.pd_sck.value(0)
        self.offset = 0

    def is_ready(self):
        return self.d_out.value() == 0

    def read(self):
        start = time.ticks_ms()
        while not self.is_ready():
            if time.ticks_diff(time.ticks_ms(), start) > 500:
                return None
            time.sleep_ms(1)
        raw = 0
        for _ in range(24):
            self.pd_sck.value(1)
            raw = (raw << 1) | self.d_out.value()
            self.pd_sck.value(0)
        self.pd_sck.value(1)
        self.pd_sck.value(0)
        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def read_average(self, times=10):
        total, valid = 0, 0
        for _ in range(times):
            val = self.read()
            if val is not None:
                total += val
                valid += 1
            time.sleep_ms(3)
        return int(total / valid) if valid > 0 else 0

    def tare(self, times=15):
        self.offset = self.read_average(times)
        return self.offset

    def get_value(self):
        val = self.read()
        return (val - self.offset) if val is not None else None

hx = HX711(d_out=HX_DT_PIN, pd_sck=HX_SCK_PIN)

# ==============================================================================
# 3. FUNGSI SENSOR DENGAN FILTER TINGGI
# ==============================================================================
def baca_sensor_ultrasonik(trig_pin, echo_pin):
    trig_pin.value(0)
    time.sleep_us(5)
    trig_pin.value(1)
    time.sleep_us(10)
    trig_pin.value(0)
    try:
        duration = time_pulse_us(echo_pin, 1, 35000)
        if duration > 100:
            cm = (duration / 2.0) / 29.1
            if 2 <= cm <= 400:
                return round(cm, 1)
        return None
    except Exception:
        return None

def baca_sensor_filter(trig_pin, echo_pin, samples=4):
    """Filter median multi-sampel untuk akurasi tinggi."""
    arr = []
    for _ in range(samples):
        d = baca_sensor_ultrasonik(trig_pin, echo_pin)
        if d is not None:
            arr.append(d)
        time.sleep_ms(12)
    if not arr:
        return None
    arr.sort()
    return arr[len(arr) // 2]

def hitung_tinggi_sampah(jarak_sensor):
    """
    Tinggi Sampah = Jarak Dasar Tong Kosong - Jarak Sensor Terbaca
    Contoh: Dasar 30 cm, sensor baca 20 cm -> Tinggi sampah = 10 cm
    """
    global jarak_dasar_tong
    if jarak_sensor is None:
        return None
    tinggi = jarak_dasar_tong - jarak_sensor
    # Toleransi getaran di dasar tong (jika selisih <= 1.0 cm dianggap 0)
    if tinggi <= 1.0:
        tinggi = 0.0
    return round(tinggi, 1)

def baca_berat_gram():
    val = hx.get_value()
    if val is not None:
        gram = val / FAKTOR_KALIBRASI
        if abs(gram) < 3.0:
            gram = 0.0
        return round(gram, 1)
    return None

# ==============================================================================
# 4. INISIALISASI SAAT BOOT
# ==============================================================================
print("=" * 65)
print("     SISTEM TONG SAMPAH PINTAR ECOSORT (AKURASI VOLUME)")
print("=" * 65)

# A. Kunci Servo ke Tutup Rapat
print("[1/3] Mengunci Servo ke posisi TUTUP (0 derajat)...")
servo.duty_u16(DUTY_TUTUP)
time.sleep(1)

# B. Auto-Tare Dasar Tong Sampah
print("[2/3] Mengukur jarak dasar tong kosong...")
time.sleep_ms(500)
d_dasar_test = baca_sensor_filter(trig_vol, echo_vol, samples=6)

if d_dasar_test is not None and d_dasar_test > 5.0:
    jarak_dasar_tong = d_dasar_test
    print("      -> Dasar terdeteksi: {:.1f} cm (Diset sebagai titik 0.0 cm)".format(jarak_dasar_tong))
else:
    jarak_dasar_tong = TINGGI_DASAR_TONG_DEFAULT
    print("      -> Menggunakan default dasar tong: {:.1f} cm".format(jarak_dasar_tong))

# C. Tare Timbangan HX711
print("[3/3] Kalibrasi titik nol timbangan (Tare)...")
hx.tare(15)
print("      -> Timbangan siap! Titik 0.0 gram terkunci.")
print("-" * 65)
print("Sistem Berjalan! Perhatikan angka 'Sensor' dan 'Tinggi Sampah':\n")

# Variabel penyimpan tinggi sampah terakhir (agar tidak terganggu saat tutup membuka)
tinggi_sampah_terakhir = 0.0
jarak_sensor_terakhir  = jarak_dasar_tong

# ==============================================================================
# 5. LOOP UTAMA
# ==============================================================================
try:
    while True:
        # 1. Baca Sensor Tangan Depan
        jarak_tangan = baca_sensor_filter(trig_tangan, echo_tangan, samples=2)

        # 2. Baca Sensor Volume Dalam (Hanya saat tutup tong sedang tertutup)
        jarak_sensor_vol = baca_sensor_filter(trig_vol, echo_vol, samples=3)
        if jarak_sensor_vol is not None:
            jarak_sensor_terakhir = jarak_sensor_vol
            tinggi_sampah_terakhir = hitung_tinggi_sampah(jarak_sensor_vol)

        # 3. Baca Berat Timbangan
        berat = baca_berat_gram()

        # Format Teks
        txt_tangan = "{:5.1f} cm".format(jarak_tangan) if jarak_tangan is not None else "  ---  "
        txt_sensor = "{:5.1f} cm".format(jarak_sensor_terakhir)
        txt_tinggi = "{:5.1f} cm".format(tinggi_sampah_terakhir)
        txt_berat  = "{:6.1f} g".format(berat) if berat is not None else "  ---  "

        # Tentukan Status
        if tinggi_sampah_terakhir >= BATAS_PENUH_CM:
            status_vol = "🔴 PENUH"
        elif tinggi_sampah_terakhir > 0.0:
            status_vol = "🟡 TERISI"
        else:
            status_vol = "🟢 KOSONG"

        print("Tangan: {} | Sensor: {} -> Tinggi: {} [{}] | Berat: {}".format(
            txt_tangan, txt_sensor, txt_tinggi, status_vol, txt_berat
        ))

        # 4. Aksi Jika Tangan Terdeteksi
        if jarak_tangan is not None and jarak_tangan <= JARAK_BUKA_TANGAN_CM:
            print("\n" + "=" * 55)
            print(">>> [1/3] TANGAN TERDETEKSI ({})! BUKA TUTUP 180°...".format(txt_tangan))
            servo.duty_u16(DUTY_BUKA)

            print(">>> [2/3] TERBUKA SELAMA {} DETIK (MEMASUKKAN SAMPAH)...".format(DURASI_BUKA_DETIK))
            for s in range(DURASI_BUKA_DETIK, 0, -1):
                berat_live = baca_berat_gram()
                b_str = "{:6.1f} g".format(berat_live) if berat_live is not None else "---"
                print("    Sisa waktu: {} detik... | Berat timbangan: {}".format(s, b_str))
                time.sleep(1)

            print(">>> [3/3] MENUTUP KEMBALI KE 0 DERAJAT...")
            servo.duty_u16(DUTY_TUTUP)
            time.sleep(1)  # Beri waktu tutup merapat stabil
            print(">>> Tutup rapat. Mengukur ulang volume isi tong...\n" + "=" * 55)

        time.sleep_ms(250)

except KeyboardInterrupt:
    print("\nProgram dihentikan.")
    servo.duty_u16(0)
    servo.deinit()
