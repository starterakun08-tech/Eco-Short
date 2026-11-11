"""
servo_hemat_daya.py
====================
MG995 pada ESP32 dengan konsumsi arus serendah mungkin.

Teknik hemat daya:
  1. Soft-start: gerak bertahap (1 derajat per langkah) → tidak ada lonjakan arus.
  2. PWM-off setelah posisi tercapai → arus holding ~0 mA (servo tidak aktif menahan).
  3. Langkah lambat dengan delay kecil → motor tidak perlu arus besar sekaligus.

Kabel:
  Merah  → VIN (5V ESP32) atau adaptor 5V eksternal
  Cokelat/Hitam → GND (harus sama dengan GND ESP32)
  Kuning/Oranye → GPIO 13 (atau ubah SERVO_PIN)
"""

from machine import Pin, PWM
import time

# ─── Konfigurasi ───────────────────────────────────────
SERVO_PIN    = 13       # Ganti jika pakai GPIO lain
FREQ         = 50       # 50 Hz standar servo
MIN_US       = 1000     # 0°   → 1000 µs
MAX_US       = 2000     # 180° → 2000 µs
STEP_DELAY   = 20       # ms antar langkah (lebih besar = lebih pelan & hemat arus)
STEP_DEG     = 2        # derajat per langkah (lebih kecil = lebih halus)
HOLD_TIME    = 4        # detik menahan posisi terbuka
CLOSE_WAIT   = 2        # detik jeda setelah kembali ke 0°
# ────────────────────────────────────────────────────────

pwm = PWM(Pin(SERVO_PIN), freq=FREQ)
current_angle = 0       # lacak posisi sekarang


def us_from_angle(angle):
    """Konversi sudut (0–180) ke lebar pulsa µs."""
    angle = max(0, min(180, angle))
    return MIN_US + (MAX_US - MIN_US) * angle // 180


def pwm_on(angle):
    """Aktifkan PWM dan set ke sudut tertentu."""
    pwm.duty_ns(us_from_angle(angle) * 1000)


def pwm_off():
    """Matikan sinyal PWM → arus hampir nol, servo berhenti menahan."""
    pwm.duty_ns(0)


def move_to(target_angle, hold_ms=300):
    """
    Gerak halus bertahap dari posisi sekarang ke target_angle.
    Setelah sampai, tahan sebentar lalu matikan PWM.
    
    Parameters
    ----------
    target_angle : int   – sudut tujuan (0–180)
    hold_ms      : int   – lama (ms) tetap aktif setelah sampai, lalu PWM dimatikan
    """
    global current_angle
    target_angle = max(0, min(180, target_angle))
    step = STEP_DEG if target_angle > current_angle else -STEP_DEG

    # Gerak bertahap
    while True:
        current_angle += step
        # Jangan lewat target
        if step > 0 and current_angle >= target_angle:
            current_angle = target_angle
            pwm_on(current_angle)
            break
        if step < 0 and current_angle <= target_angle:
            current_angle = target_angle
            pwm_on(current_angle)
            break
        pwm_on(current_angle)
        time.sleep_ms(STEP_DELAY)

    # Tahan sebentar agar servo settle, lalu matikan arus
    time.sleep_ms(hold_ms)
    pwm_off()
    print("Posisi: {}° | PWM OFF (hemat daya)".format(current_angle))


def main():
    global current_angle
    print("=== Servo Hemat Daya ===")

    # Pastikan mulai di 0°
    print("Init: ke 0°...")
    pwm_on(0)
    time.sleep_ms(500)
    pwm_off()
    current_angle = 0
    time.sleep(1)

    while True:
        # Buka → 90°
        print("BUKA: gerak ke 90°")
        move_to(90, hold_ms=500)         # settle 500 ms lalu PWM off
        time.sleep(HOLD_TIME)            # tunggu 4 detik (tanpa arus!)

        # Tutup → 0°
        print("TUTUP: kembali ke 0°")
        move_to(0, hold_ms=500)
        time.sleep(CLOSE_WAIT)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pwm_off()
        pwm.deinit()
        print("Dihentikan.")

