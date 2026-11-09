"""
============================================================
  KODE SERVO MG995: PUTAR 90 DERAJAT LANGSUNG & STABIL
============================================================
PENYEBAB SEBELUMNYA GAGAL:
Software mencoba menggeser 2 derajat tiap 20ms ('servo_smooth'),
yang membuat sirkuit internal MG995 bingung dan memicu kejet-kejet.

KODE BARU INI (STANDAR INDUSTRI):
1. Kirim sinyal 90 derajat LANGSUNG dengan full power motor.
2. TAHAN sinyal PWM selama 4 DETIK PENUH (tidak akan jatuh/kejet-kejet).
3. Kirim sinyal 0 derajat LANGSUNG untuk kembali ke awal.
4. Jeda 3 detik di posisi awal, lalu ulang siklus.

Pin Servo: GPIO 5
Metode   : duty_u16 standar frekuensi 50Hz
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 5  # GPIO 5

# Inisialisasi PWM 50Hz
servo = PWM(Pin(SERVO_PIN), freq=50)

def set_angle(angle):
    """Kirim target sudut langsung (0 - 180 derajat)."""
    angle = max(0, min(180, angle))
    # Rumus yang terbukti menggerakkan motor Anda:
    pulse_us = 500 + (angle / 180.0) * 2000
    duty = int((pulse_us / 20000.0) * 65535)
    servo.duty_u16(duty)

print("=" * 55)
print("  SERVO MG995: 90 DERAJAT -> TAHAN 4 DETIK -> 0 DERAJAT")
print("=" * 55)
print("Pin Servo : GPIO 5")
print("Tekan Ctrl+C untuk berhenti.")
print("-" * 55)

# Posisi awal (0 derajat)
print("Set ke posisi awal 0 derajat...")
set_angle(0)
time.sleep(2)

siklus = 1
try:
    while True:
        print("\n" + "=" * 45)
        print(">>> SIKLUS #{}: GERAKAN DIMULAI".format(siklus))
        print("=" * 45)

        # 1. Buka 90 Derajat
        print("[1] MEMUTAR KE 90 DERAJAT...")
        set_angle(90)
        
        # 2. Tahan 4 Detik (Sinyal PWM TETAP ON agar kokoh menahan)
        print("[2] MENAHAN POSISI 90 DERAJAT SELAMA 4 DETIK...")
        for s in range(4, 0, -1):
            print("    Sisa waktu tahan: {} detik...".format(s))
            time.sleep(1)

        # 3. Kembali ke 0 Derajat
        print("[3] MEMUTAR KEMBALI KE 0 DERAJAT (POSISI AWAL)...")
        set_angle(0)
        
        # 4. Standby di posisi awal
        print("[4] Standby di posisi 0 derajat selama 3 detik...")
        time.sleep(3)
        
        siklus += 1

except KeyboardInterrupt:
    print("\nPengujian dihentikan.")
    set_angle(0)
    time.sleep_ms(500)
    servo.duty_u16(0)
    servo.deinit()
    print("PWM dimatikan. Selesai.")
