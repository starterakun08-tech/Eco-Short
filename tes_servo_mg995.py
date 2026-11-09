"""
============================================================
  TES MANDIRI KHUSUS SERVO MG995 (STANDALONE)
============================================================
Gunakan script ini untuk memastikan apakah Servo MG995
merespons sinyal PWM dan memiliki daya yang cukup.

WIRING SERVO MG995:
- Kabel Cokelat / Hitam  --> GND ESP32
- Kabel Merah            --> VIN (5V) ESP32 (JANGAN ke 3V3!)
- Kabel Oranye / Kuning  --> GPIO 18 ESP32
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 18
servo = PWM(Pin(SERVO_PIN), freq=50)

def set_pulse_us(pulse_us):
    """Kirim sinyal pulsa mikrodetik langsung ke servo."""
    # Periode 50Hz = 20.000 us. Duty 16-bit = (pulse_us / 20000) * 65535
    duty = int((pulse_us / 20000.0) * 65535)
    servo.duty_u16(duty)

def set_angle(angle):
    """
    Sudut 0 - 180 derajat untuk servo MG995:
    - 0 derajat   = 1000 us (duty ~3276)
    - 90 derajat  = 1500 us (duty ~4915)
    - 180 derajat = 2000 us (duty ~6553)
    """
    angle = max(0, min(180, angle))
    pulse_us = 1000 + (angle / 180.0) * 1000
    set_pulse_us(pulse_us)

print("=" * 55)
print("     TES DIAGNOSTIK SERVO MG995")
print("=" * 55)
print("1. Pastikan kabel Merah di VIN (5V) & Cokelat di GND.")
print("2. Pastikan kabel Oranye di GPIO 18.")
print("-" * 55)

# TAHAP 1: Uji Holding Torque (Daya Cengkeram Motor)
print("\n[TAHAP 1] Mengirim pulsa Netral (1500 us / 90 derajat)...")
set_pulse_us(1500)
print(">>> Coba raba / putar perlahan as servo dengan tangan Anda!")
print("    - Jika terasa KERAS / MENGUNCI (menahan posisi) = DAYA & KABEL OK!")
print("    - Jika terasa LEMAS / BEBAS DIPUTAR = TIDAK ADA TEGANGAN / KABEL SALAH!")
time.sleep(3)

# TAHAP 2: Gerakan Bertahap 0 -> 90 -> 180 -> 0
print("\n[TAHAP 2] Menggerakkan Servo ke beberapa sudut standar...")

for sudut in [0, 45, 90, 135, 180, 90, 0]:
    print("  -> Bergerak ke sudut: {} derajat".format(sudut))
    set_angle(sudut)
    time.sleep(1.5)

# TAHAP 3: Uji Rentang Lebar (750 us s/d 2250 us)
print("\n[TAHAP 3] Uji Rentang Lebar (750 us s/d 2250 us)...")
print("  -> Pulsa minimum (750 us)...")
set_pulse_us(750)
time.sleep(1.5)

print("  -> Pulsa tengah (1500 us)...")
set_pulse_us(1500)
time.sleep(1.5)

print("  -> Pulsa maksimum (2250 us)...")
set_pulse_us(2250)
time.sleep(1.5)

print("  -> Kembali ke 1000 us (Posisi 0)...")
set_pulse_us(1000)
time.sleep(1.5)

print("\n" + "=" * 55)
print("TES SELESAI!")
print("Apakah servo Anda bergerak sama sekali selama tes ini?")
print("=" * 55)
