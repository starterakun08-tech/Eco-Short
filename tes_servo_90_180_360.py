"""
============================================================
  KODE SERVO MG995: PUTAR 90 DERAJAT -> TAHAN 4 DETIK -> KEMBALI 0
============================================================
Logika:
1. Posisi Awal (0 Derajat / 1000 us).
2. Memutar Halus 90 Derajat (1500 us).
3. Menahan kokoh di posisi 90 Derajat selama 4 DETIK.
4. Memutar Halus Kembali ke Posisi Awal (0 Derajat).
5. Jeda 3 detik, lalu mengulang siklus.

Pin Servo: GPIO 5
Metode   : duty_ns() hardware timer (Anti-Getar & Halus)
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 5  # GPIO 5

# Konfigurasi PWM 50Hz (periode 20ms)
servo = PWM(Pin(SERVO_PIN), freq=50)

# Rentang pulsa aman anti-mentok untuk MG995:
PULSA_0_DEG  = 1000   # Posisi Awal (0 derajat)
PULSA_90_DEG = 1500   # Posisi Buka (90 derajat)
JEDA_TAHAN   = 4      # Tahan selama 4 detik

def set_pulse_us(us):
    """Kirim sinyal mikrodetik langsung via hardware timer nanodetik."""
    servo.duty_ns(int(us * 1000))

def gerak_halus(us_mulai, us_tujuan, step_us=15, delay_ms=15):
    """Menggeser posisi secara bertahap agar gerakan stabil tanpa hentakan."""
    if us_mulai < us_tujuan:
        for u in range(us_mulai, us_tujuan + 1, step_us):
            set_pulse_us(u)
            time.sleep_ms(delay_ms)
    else:
        for u in range(us_mulai, us_tujuan - 1, -step_us):
            set_pulse_us(u)
            time.sleep_ms(delay_ms)
    set_pulse_us(us_tujuan)

print("=" * 55)
print("  SERVO MG995: BUKA 90 DEG -> TAHAN 4 DETIK -> TUTUP 0 DEG")
print("=" * 55)
print("Pin Servo : GPIO 5")
print("Tekan Ctrl+C di Thonny untuk berhenti.")
print("-" * 55)

# 1. Inisialisasi ke Posisi Awal
print("Menyetel posisi awal (0 Derajat)...")
set_pulse_us(PULSA_0_DEG)
time.sleep(2)
posisi_sekarang = PULSA_0_DEG

try:
    siklus = 1
    while True:
        print("\n" + "=" * 45)
        print(">>> SIKLUS #{}: MEMULAI GERAKAN".format(siklus))
        print("=" * 45)

        # LANGKAH 1: Memutar 90 Derajat
        print("[1] Memutar HALUS ke 90 DERAJAT...")
        gerak_halus(posisi_sekarang, PULSA_90_DEG, step_us=15, delay_ms=15)
        posisi_sekarang = PULSA_90_DEG
        print("    -> Sudah di posisi 90 Derajat!")

        # LANGKAH 2: Menahan di 90 Derajat selama 4 Detik
        print("[2] MENAHAN POSISI SELAMA {} DETIK...".format(JEDA_TAHAN))
        for s in range(JEDA_TAHAN, 0, -1):
            print("    Sisa waktu tahan: {} detik...".format(s))
            time.sleep(1)

        # LANGKAH 3: Memutar Kembali ke 0 Derajat
        print("[3] Memutar HALUS KEMBALI ke 0 DERAJAT (Posisi Awal)...")
        gerak_halus(posisi_sekarang, PULSA_0_DEG, step_us=15, delay_ms=15)
        posisi_sekarang = PULSA_0_DEG
        print("    -> Sudah kembali ke Posisi Awal (0 Derajat)!")

        # Jeda sebelum siklus berikutnya
        print("[4] Standby di posisi awal selama 3 detik...")
        time.sleep(3)
        siklus += 1

except KeyboardInterrupt:
    print("\nPengujian dihentikan.")
    print("Mengembalikan ke posisi 0 derajat...")
    set_pulse_us(PULSA_0_DEG)
    time.sleep_ms(500)
    servo.duty_ns(0)
    servo.deinit()
    print("PWM dinonaktifkan. Selesai.")
