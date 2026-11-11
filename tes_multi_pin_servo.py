"""
============================================================
  TES MULTI-PIN SERVO MG995 (MENGUJI BEBERAPA PIN GPIO)
============================================================
Script ini mengirim sinyal putaran servo ke 5 pin GPIO sekaligus:
- GPIO 18
- GPIO 13
- GPIO 27
- GPIO 25
- GPIO 14

Jika GPIO 18 bermasalah, Anda cukup pindahkan kabel sinyal (oren)
ke GPIO 13, 27, atau 25 tanpa perlu mengubah kode!
============================================================
"""
from machine import Pin, PWM
import time

PINS = [18, 13, 27, 25, 14]
pwm_list = []

print("=" * 55)
print("  INISIALISASI PWM PADA PIN:", PINS)
print("=" * 55)

for p in PINS:
    try:
        pwm = PWM(Pin(p), freq=50)
        pwm_list.append(pwm)
        print("  -> Pin GPIO {} Siap!".format(p))
    except Exception as e:
        print("  -> Pin GPIO {} Gagal: {}".format(p, e))

def gerak_semua_pin(target_angle):
    """Kirim sinyal sudut ke semua pin PWM yang aktif."""
    # Konversi sudut (0-180) ke pulse (500us - 2500us)
    pulse_us = 500 + (target_angle / 180.0) * 2000
    duty = int((pulse_us / 20000.0) * 65535)
    for pwm in pwm_list:
        pwm.duty_u16(duty)

print("\n--- MULAI PENGUJIAN PUTARAN ---")
print("Coba colok kabel sinyal (kuning servo) ke:")
print("GPIO 18, atau GPIO 13, atau GPIO 27, atau GPIO 25")
print("Tekan Ctrl+C untuk berhenti.")
print("-" * 55)

try:
    while True:
        print("\n>>> Memutar ke 90 DERAJAT...")
        for a in range(0, 91, 5):
            gerak_semua_pin(a)
            time.sleep_ms(25)
        time.sleep(3)
        
        print(">>> Memutar kembali ke 0 DERAJAT...")
        for a in range(90, -1, -5):
            gerak_semua_pin(a)
            time.sleep_ms(25)
        time.sleep(3)

except KeyboardInterrupt:
    print("\nBerhenti. Melepas semua PWM...")
    for pwm in pwm_list:
        pwm.duty_u16(0)
        pwm.deinit()
    print("Selesai.")

