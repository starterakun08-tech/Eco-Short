"""
============================================================
  KODE KHUSUS SERVO MG995: ANTI-GETAR & ANTI-MENTOK
============================================================
KENAPA SERVO HANYA BERGETAR DAN TIDAK MUTER?
Penyebab utama: Pulsa 500us terlalu ekstrem!
Di dalam gir MG995 ada pembatas fisik (stopper). Sinyal 500us
memaksa gir menabrak pembatas tersebut, sehingga motor berusaha
mendorong pembatas mati-matian -> AKIBATNYA HANYA BERGETAR/MENDENGUNG.

SOLUSI DI KODE INI:
1. Mulai dari titik NETRAL (1500 us / 90 derajat di tengah).
2. Hanya bergerak di rentang AMAN: 1000 us s/d 2000 us.
3. Menggunakan fungsi hardware ESP32 'duty_ns()' (nanodetik)
   bebas jitter, anti-getar, dan sangat stabil.
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 5  # GPIO 5

# Inisialisasi PWM 50Hz
servo = PWM(Pin(SERVO_PIN), freq=50)

def set_pulse_us(us):
    """Kirim pulsa mikrodetik langsung via hardware timer nanodetik."""
    # 1 us = 1.000 nanodetik
    servo.duty_ns(int(us * 1000))

print("=" * 55)
print("  SOLUSI SERVO HANYA BERGETAR (ANTI-MENTOK)")
print("=" * 55)
print("Pin Servo: GPIO 5")
print("-" * 55)

try:
    # TAHAP 1: Bawa ke titik tengah aman (1500 us)
    print("\n[STEP 1] Menyetel ke TITIK TENGAH NETRAL (1500 us)...")
    print("         (Ini posisi paling aman, jauh dari pembatas gir)")
    set_pulse_us(1500)
    time.sleep(3)

    while True:
        # Gerakan 1: Geser sedikit ke KIRI (1300 us ~ 60 derajat)
        print("\n>>> Geser ke KIRI SEDIKIT (1300 us)...")
        set_pulse_us(1300)
        time.sleep(2)

        # Gerakan 2: Kembali ke TENGAH (1500 us ~ 90 derajat)
        print(">>> Kembali ke TENGAH (1500 us)...")
        set_pulse_us(1500)
        time.sleep(2)

        # Gerakan 3: Geser sedikit ke KANAN (1700 us ~ 120 derajat)
        print(">>> Geser ke KANAN SEDIKIT (1700 us)...")
        set_pulse_us(1700)
        time.sleep(2)

        # Gerakan 4: Rentang Lebih Lebar (1100 us ~ 30 derajat)
        print("\n>>> Rentang Lebar: KIRI (1100 us)...")
        set_pulse_us(1100)
        time.sleep(2)

        # Gerakan 5: Rentang Lebih Lebar (1900 us ~ 150 derajat)
        print(">>> Rentang Lebar: KANAN (1900 us)...")
        set_pulse_us(1900)
        time.sleep(2)

        # Kembali ke Netral
        print(">>> Kembali NETRAL (1500 us)...")
        set_pulse_us(1500)
        print("--- Siklus selesai, jeda 3 detik ---")
        time.sleep(3)

except KeyboardInterrupt:
    print("\nBerhenti. Mematikan sinyal PWM...")
    servo.duty_ns(0)
    servo.deinit()
    print("Servo rileks / dimatikan.")

