"""
============================================================
  TES SERVO + ULTRASONIK RCWL-9616
============================================================
- Jarak tangan <= 20 cm → Servo buka 90 derajat
- Jeda 6 detik → Servo tutup kembali ke 0 derajat
- Pin: Trig=19, Echo=21, Servo=18
============================================================
"""
from machine import Pin, PWM, time_pulse_us
import time

# --- PIN ---
TRIG_PIN = 19
ECHO_PIN = 21
SERVO_PIN = 18

# --- PENGATURAN ---
JARAK_DETEKSI_CM = 20     # Jarak tangan untuk buka tutup
JEDA_TUTUP_DETIK = 6      # Jeda sebelum tutup kembali
SUDUT_TUTUP = 0            # Posisi tertutup
SUDUT_BUKA = 90            # Posisi terbuka

# --- INISIALISASI ---
trig = Pin(TRIG_PIN, Pin.OUT)
echo = Pin(ECHO_PIN, Pin.IN)
servo = PWM(Pin(SERVO_PIN), freq=50)

is_open = False
last_detect_ms = 0


def set_servo(angle):
    """
    Atur sudut servo 0-180 derajat untuk MG995:
    - 0 derajat   = 1000 us
    - 90 derajat  = 1500 us (atau tengah)
    - 180 derajat = 2000 us
    """
    angle = max(0, min(180, angle))
    pulse_us = 1000 + (angle / 180.0) * 1000
    duty = int((pulse_us / 20000.0) * 65535)
    servo.duty_u16(duty)


def gerak_halus(target, delay_ms=8):
    """Gerakkan servo secara halus ke sudut target."""
    global current_angle
    target = max(0, min(180, target))
    step = 4 if target > current_angle else -4
    for a in range(current_angle, target, step):
        set_servo(a)
        time.sleep_ms(delay_ms)
    set_servo(target)
    current_angle = target


def release_servo():
    """Matikan PWM agar servo tidak mendengung."""
    servo.duty_u16(0)


def baca_jarak():
    """Baca jarak dari sensor ultrasonik."""
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)

    try:
        dur = time_pulse_us(echo, 1, 50000)
        if dur > 100:
            cm = (dur / 2.0) / 29.1
            if 2 <= cm <= 300:
                return cm
    except:
        pass
    return None


# --- MULAI ---
current_angle = SUDUT_TUTUP
set_servo(SUDUT_TUTUP)
time.sleep_ms(500)
release_servo()

print("=" * 50)
print("  SERVO + ULTRASONIK AKTIF")
print("=" * 50)
print("Jarak deteksi: <= {} cm".format(JARAK_DETEKSI_CM))
print("Jeda tutup: {} detik".format(JEDA_TUTUP_DETIK))
print("Dekatkan tangan ke sensor!")
print("Tekan Ctrl+C untuk berhenti.")
print("-" * 50)

try:
    while True:
        jarak = baca_jarak()
        now_ms = time.ticks_ms()

        if jarak is not None:
            print("Jarak: {:.1f} cm | Tutup: {}".format(
                jarak, "TERBUKA" if is_open else "TERTUTUP"))

            # Tangan terdeteksi dalam jarak <= 20 cm
            if jarak <= JARAK_DETEKSI_CM:
                last_detect_ms = now_ms
                if not is_open:
                    print(">>> TANGAN TERDETEKSI! MEMBUKA TUTUP...")
                    gerak_halus(SUDUT_BUKA)
                    is_open = True
        else:
            print("Jarak: --- | Tutup: {}".format(
                "TERBUKA" if is_open else "TERTUTUP"))

        # Tutup kembali setelah 6 detik tangan menjauh
        if is_open and time.ticks_diff(now_ms, last_detect_ms) > (JEDA_TUTUP_DETIK * 1000):
            print(">>> MENUTUP KEMBALI...")
            gerak_halus(SUDUT_TUTUP)
            time.sleep_ms(300)
            release_servo()
            is_open = False

        time.sleep_ms(150)

except KeyboardInterrupt:
    set_servo(SUDUT_TUTUP)
    time.sleep_ms(500)
    release_servo()
    print("\nBerhenti. Servo kembali ke 0 derajat.")

