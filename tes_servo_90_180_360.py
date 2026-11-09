"""
============================================================
  TES MANDIRI SERVO MG995: 0 -> 90 -> 180 -> UJI 360 DERAJAT
============================================================
Tanpa sensor ultrasonik sama sekali.
Pin Servo: GPIO 5

Catatan Jenis MG995:
1. Jika MG995 180 Derajat (Standar):
   - Akan berhenti di 0, 90, dan 180 derajat secara presisi.
2. Jika MG995 360 Derajat (Continuous):
   - Sinyal 90 derajat = Berhenti (Stop)
   - Sinyal 0 & 180 derajat = Berputar terus-menerus (Maju / Mundur).
============================================================
"""
from machine import Pin, PWM
import time

SERVO_PIN = 5
servo_pwm = PWM(Pin(SERVO_PIN), freq=50)

current_angle = 0

def set_servo_angle(angle):
    """Kirim sudut servo (0 - 180 derajat)."""
    global current_angle
    angle = max(0, min(180, int(angle)))
    current_angle = angle
    # MG995: 500us (0 deg) s/d 2500us (180 deg)
    pulse_us = 500 + (angle / 180.0) * 2000
    duty = int((pulse_us / 20000.0) * 65535)
    servo_pwm.duty_u16(duty)

def gerak_halus(target, delay_ms=20, step=2):
    """Gerakan bertahap agar stabil dan arus tidak anjlok."""
    global current_angle
    target = max(0, min(180, int(target)))
    if current_angle < target:
        for a in range(current_angle, target + 1, step):
            set_servo_angle(a)
            time.sleep_ms(delay_ms)
    else:
        for a in range(current_angle, target - 1, -step):
            set_servo_angle(a)
            time.sleep_ms(delay_ms)
    set_servo_angle(target)

print("=" * 55)
print("  MULAI PENGUJIAN SUDUT SERVO (GPIO 5)")
print("=" * 55)
print("Perhatikan gerakan fisik tuas servo Anda!")
print("-" * 55)

try:
    while True:
        # 1. Posisi 0 Derajat
        print("\n>>> [1] Posisi: 0 DERAJAT (Tutup Rapat)")
        gerak_halus(0, delay_ms=20, step=2)
        print("    Menahan di 0 derajat selama 3 detik...")
        time.sleep(3)

        # 2. Posisi 90 Derajat
        print("\n>>> [2] Posisi: 90 DERAJAT (Tegak Lurus / Terbuka)")
        gerak_halus(90, delay_ms=20, step=2)
        print("    Menahan di 90 derajat selama 3 detik...")
        time.sleep(3)

        # 3. Posisi 180 Derajat
        print("\n>>> [3] Posisi: 180 DERAJAT (Maksimal Putaran)")
        gerak_halus(180, delay_ms=20, step=2)
        print("    Menahan di 180 derajat selama 3 detik...")
        time.sleep(3)

        # 4. Kembali Halus ke 0 Derajat
        print("\n>>> [4] Memutar Kembali secara Halus ke 0 DERAJAT...")
        gerak_halus(0, delay_ms=20, step=2)
        print("    Menahan di 0 derajat selama 2 detik...")
        time.sleep(2)

        # 5. Uji Mode Putaran Bebas (360 Derajat Continuous Check)
        print("\n>>> [5] UJI SINYAL 360 DERAJAT:")
        print("    - Jika servo 180 deg : Akan tetap di posisi ujung.")
        print("    - Jika servo 360 deg : Akan berputar penuh tanpa henti.")
        set_servo_angle(180)
        time.sleep(3)

        print("\n" + "=" * 55)
        print("Satu siklus selesai! Mengulang pengujian...")
        print("Tekan Ctrl+C di Thonny untuk berhenti.")
        print("=" * 55)
        time.sleep(2)

except KeyboardInterrupt:
    print("\nPengujian dihentikan oleh pengguna.")
    set_servo_angle(0)
    time.sleep_ms(500)
    servo_pwm.duty_u16(0)
    servo_pwm.deinit()
    print("PWM dinonaktifkan. Servo lemas.")
