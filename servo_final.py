from machine import Pin, PWM
import time

# ==============================================================================
# TES SERVO MG995 - MULTI PIN OTOMATIS (PIN 5, 13, 18)
# Sinyal dikirim bersamaan ke Pin 5, 13, dan 18.
# Mau kabel kuning Anda dicolok ke D5, D13, atau D18, sinyal PASTI masuk!
# ==============================================================================

PINS = [5, 13, 18]
servos = [PWM(Pin(p), freq=50) for p in PINS]

# Nilai Duty Cycle Standar MicroPython (duty_u16):
# 50 Hz = periode 20.000 us
# 0 derajat   = 1000 us -> duty_u16 = 3276
# 90 derajat  = 1500 us -> duty_u16 = 4915
# 180 derajat = 2000 us -> duty_u16 = 6553
DUTY_0   = 3276
DUTY_90  = 4915
DUTY_180 = 6553

def set_all(duty):
    for s in servos:
        s.duty_u16(duty)

print("=" * 50)
print("  PROGRAM TES SERVO MG995 (PIN 5, 13, 18 AKTIF)")
print("  Pastikan GND Adaptor tersambung ke GND ESP32!")
print("=" * 50)

time.sleep(1)

try:
    while True:
        print("\n>>> Putar ke 0 Derajat...")
        set_all(DUTY_0)
        time.sleep(2)

        print(">>> Putar ke 90 Derajat (Tahan 4 Detik)...")
        set_all(DUTY_90)
        time.sleep(4)

        print(">>> Kembali ke 0 Derajat...")
        set_all(DUTY_0)
        time.sleep(2)

except KeyboardInterrupt:
    print("\nProgram dihentikan.")
    for s in servos:
        s.duty_u16(0)
        s.deinit()
