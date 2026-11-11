"""
============================================================
  TES SERVO MG995 DENGAN METODE duty_ns() (REKOMENDASI CLAUDE)
============================================================
"""
from machine import Pin, PWM
import time

print("=" * 50)
print("  TES SERVO MG995 - duty_ns()")
print("=" * 50)

try:
    servo = PWM(Pin(18), freq=50)
    
    # 1000us (0 deg) -> 1500us (90 deg) -> 2000us (180 deg)
    for us in (1000, 1500, 2000, 1500, 1000):
        print("Kirim Pulsa: {} us ({} ns)...".format(us, us * 1000))
        servo.duty_ns(us * 1000)
        time.sleep(2)
        
    print("\nMelepas sinyal PWM (deinit)...")
    servo.deinit()
    print("Selesai! As servo sekarang seharusnya lemas kembali.")
except Exception as e:
    print("Error:", e)
