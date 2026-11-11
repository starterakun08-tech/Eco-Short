"""
============================================================
  TES SERVO MG995 DI PIN D13 (POJOK KANAN BAWAH ESP32)
============================================================
WIRING SERVO DI POJOK KANAN BAWAH:
- Kabel Merah    --> Pin VIN (Paling Pojok Bawah Kanan)
- Kabel Cokelat  --> Pin GND (Nomor 2 dari Bawah Kanan)
- Kabel Kuning   --> Pin D13 (Nomor 3 dari Bawah Kanan)

LOGIKA:
Putar 90 Derajat -> Tahan 4 Detik -> Putar Balik ke 0 Derajat
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 13  # GPIO 13 (Pin D13 di sebelah GND & VIN)

servo = PWM(Pin(SERVO_PIN), freq=50)

def set_angle(angle):
    """Kirim target sudut langsung (0 - 180 derajat)."""
    angle = max(0, min(180, angle))
    pulse_us = 500 + (angle / 180.0) * 2000
    duty = int((pulse_us / 20000.0) * 65535)
    servo.duty_u16(duty)

print("=" * 55)
print("  UJI SERVO MG995 PADA PIN D13 (GPIO 13)")
print("=" * 55)
print("Pastikan kabel dicolok di 3 pin pojok kanan bawah:")
print("  VIN (Merah) | GND (Cokelat) | D13 (Kuning/Oranye)")
print("-" * 55)

print("Set posisi awal 0 derajat...")
set_angle(0)
time.sleep(2)

siklus = 1
try:
    while True:
        print("\n" + "=" * 45)
        print(">>> SIKLUS #{}: MULAI GERAK".format(siklus))
        print("=" * 45)

        print("[1] MEMUTAR KE 90 DERAJAT...")
        set_angle(90)

        print("[2] MENAHAN 4 DETIK...")
        for s in range(4, 0, -1):
            print("    Tahan: {} detik...".format(s))
            time.sleep(1)

        print("[3] KEMBALI KE 0 DERAJAT...")
        set_angle(0)

        print("[4] Standby 3 detik...")
        time.sleep(3)
        siklus += 1

except KeyboardInterrupt:
    print("\nBerhenti.")
    set_angle(0)
    time.sleep_ms(500)
    servo.duty_u16(0)
    servo.deinit()
    print("Selesai.")

