"""
====================================================================
  PROGRAM TEST SENSOR ULTRASONIK: VOLUME / KAPASITAS TEMPAT SAMPAH
====================================================================
Koneksi Pin ke ESP32:
  - VCC   --> Pin VIN (5V) atau 3V3
  - GND   --> Pin GND
  - TRIG  --> Pin GPIO 23 (D23)
  - ECHO  --> Pin GPIO 14 (D14)

Logika Ketinggian Sampah:
  - Saat tidak ada sampah sama sekali --> Terbaca 0.0 cm (KOSONG)
  - Saat sampah mulai masuk           --> Angka bertambah sesuai tinggi sampah
  - Saat tinggi sampah >= 10.0 cm     --> 🔴 PENUH
====================================================================
"""
from machine import Pin, time_pulse_us
import time

# --- KONFIGURASI PIN ---
TRIG_PIN = 23  # D23
ECHO_PIN = 14  # D14

# --- ATURAN AMBANG BATAS ---
BATAS_PENUH_CM      = 10.0  # Jika tinggi sampah >= 10 cm -> PENUH
JARAK_DASAR_TONG_CM = 35.0  # Default dasar tong (akan otomatis di-tare saat boot)

trig = Pin(TRIG_PIN, Pin.OUT)
echo = Pin(ECHO_PIN, Pin.IN)

def get_single_distance():
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)

    try:
        duration = time_pulse_us(echo, 1, 35000)
        if duration > 100:
            cm = (duration / 2.0) / 29.1
            if 2 <= cm <= 400:
                return round(cm, 1)
        return None
    except Exception:
        return None

def get_distance_filtered(samples_count=3):
    samples = []
    for _ in range(samples_count):
        d = get_single_distance()
        if d is not None:
            samples.append(d)
        time.sleep_ms(20)

    if not samples:
        return None

    samples.sort()
    return samples[len(samples) // 2]

def hitung_tinggi_sampah(jarak_sensor):
    if jarak_sensor is None:
        return None
    # Tinggi sampah = Jarak ke dasar kosong - Jarak ke tumpukan sampah
    tinggi = JARAK_DASAR_TONG_CM - jarak_sensor
    if tinggi < 0.5:
        tinggi = 0.0
    return round(tinggi, 1)

# ==========================================================
#  PROGRAM UTAMA
# ==========================================================
print("=" * 60)
print("  MONITORING VOLUME TEMPAT SAMPAH (ULTRASONIK D23 & D14)")
print("=" * 60)
print("Pin TRIG     : GPIO 23 (D23)")
print("Pin ECHO     : GPIO 14 (D14)")
print("Aturan Penuh : Tinggi Sampah >= {:.1f} cm".format(BATAS_PENUH_CM))
print("-" * 60)

# Auto-Tare Ketinggian Dasar Tong saat pertama kali nyala
print("Mengukur dasar tong kosong (Tare Ketinggian)...")
jarak_awal = get_distance_filtered(samples_count=5)
if jarak_awal is not None and jarak_awal > 3.0:
    JARAK_DASAR_TONG_CM = jarak_awal
    print("-> Dasar terdeteksi pada: {:.1f} cm. Titik 0.0 cm terkunci!\n".format(JARAK_DASAR_TONG_CM))
else:
    print("-> Menggunakan jarak dasar default: {:.1f} cm\n".format(JARAK_DASAR_TONG_CM))

try:
    while True:
        jarak_sensor = get_distance_filtered()
        tinggi_sampah = hitung_tinggi_sampah(jarak_sensor)

        if tinggi_sampah is not None:
            if tinggi_sampah >= BATAS_PENUH_CM:
                status = "🔴 PENUH (>= 10 cm)"
            elif tinggi_sampah > 0.0:
                status = "🟡 TERISI"
            else:
                status = "🟢 KOSONG (0 cm)"

            print("Tinggi Sampah: {:5.1f} cm (Sensor: {:5.1f} cm) | Status: {}".format(
                tinggi_sampah, jarak_sensor, status
            ))
        else:
            print("Sensor Timeout / Pantulan Tidak Terbaca")

        time.sleep_ms(400)

except KeyboardInterrupt:
    print("\nProgram dihentikan.")
