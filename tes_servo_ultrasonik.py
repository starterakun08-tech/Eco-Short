"""
==========================================================
  KODE ASLI SERVO MG995 + ULTRASONIK (DENGAN SERVO_SMOOTH)
==========================================================
- Deteksi tangan <= 20 cm -> Membuka 90 derajat secara halus
- Menahan terbuka selama 6 detik
- Menutup kembali ke 0 derajat secara halus
- Menggunakan step-by-step (step=2) agar arus USB tidak melonjak
==========================================================
"""
from machine import Pin, PWM, time_pulse_us
import time

# ==========================================================
#  KONFIGURASI PIN RANGKAIAN
# ==========================================================
TRIG_PIN = 19
ECHO_PIN = 21       # Echo dihubungkan ke GPIO 21
SERVO_PIN = 18      # Sinyal Servo MG995 dihubungkan ke GPIO 18

trig = Pin(TRIG_PIN, Pin.OUT)
echo = Pin(ECHO_PIN, Pin.IN)
servo_pwm = PWM(Pin(SERVO_PIN), freq=50)  # Frekuensi standar servo 50 Hz

# ==========================================================
#  PENGATURAN LOGIKA TONG SAMPAH
# ==========================================================
JARAK_DETEKSI_CM = 20     # Jarak tangan untuk membuka tutup (cm)
DURASI_BUKA_DETIK = 6     # Lama tutup tong terbuka (6 detik)
SUDUT_TUTUP = 0           # Sudut tertutup (0 derajat)
SUDUT_BUKA = 90           # Sudut terbuka (90 derajat)

current_angle = 0


# ==========================================================
#  FUNGSI KONTROL SERVO MG995
# ==========================================================
def set_servo_angle(angle):
    """Atur sudut servo antara 0 s/d 180 derajat."""
    global current_angle
    angle = max(0, min(180, int(angle)))
    current_angle = angle
    # Konversi sudut ke pulse width (500us - 2500us) pada periode 20.000us
    pulse_us = 500 + (angle / 180.0) * (2500 - 500)
    duty = int((pulse_us / 20000.0) * 65535)
    servo_pwm.duty_u16(duty)


def servo_smooth(target_angle, delay_ms=15, step=2):
    """Gerakan servo secara bertahap dan halus (mencegah lonjakan arus USB)."""
    global current_angle
    target_angle = max(0, min(180, int(target_angle)))
    if current_angle < target_angle:
        for a in range(current_angle, target_angle + 1, step):
            set_servo_angle(a)
            time.sleep_ms(delay_ms)
    else:
        for a in range(current_angle, target_angle - 1, -step):
            set_servo_angle(a)
            time.sleep_ms(delay_ms)
    set_servo_angle(target_angle)


def release_servo():
    """Matikan sinyal PWM saat diam agar servo rileks, tidak bergetar & tidak panas."""
    servo_pwm.duty_u16(0)


# ==========================================================
#  FUNGSI BACA JARAK ULTRASONIK (HC-SR04 / RCWL-9616)
# ==========================================================
def get_distance_cm():
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)

    try:
        duration = time_pulse_us(echo, 1, 50000)
        if duration > 100:
            cm = (duration / 2.0) / 29.1
            if 2 <= cm <= 300:
                return cm
        return None
    except Exception:
        return None


# ==========================================================
#  PROGRAM UTAMA
# ==========================================================
print("=" * 55)
print("  SISTEM ULTRASONIK + SERVO MG995 AKTIF")
print("=" * 55)
print("Jarak Deteksi : <= {} cm".format(JARAK_DETEKSI_CM))
print("Durasi Buka   : {} detik".format(DURASI_BUKA_DETIK))
print("Pin           : Trig=19, Echo=21, Servo=18")
print("-" * 55)

# Posisi awal: tutup tong tertutup rapat
print("Inisialisasi posisi awal (0 derajat)...")
set_servo_angle(SUDUT_TUTUP)
time.sleep_ms(500)
release_servo()
print("Siap! Dekatkan tangan Anda ke sensor.")
print("-" * 55)

try:
    while True:
        jarak = get_distance_cm()

        if jarak is not None:
            print("Jarak: {:5.1f} cm | Status: {}".format(
                jarak, "TANGAN DEKAT" if jarak <= JARAK_DETEKSI_CM else "Standby"))

            # Jika tangan / objek terdeteksi mendekat (<= 20 cm)
            if jarak <= JARAK_DETEKSI_CM:
                print("\n>>> TANGAN TERDETEKSI! Membuka tutup tong (90 deg)...")
                servo_smooth(SUDUT_BUKA, delay_ms=12, step=2)
                release_servo()  # Rilekskan motor saat terbuka

                # Tunggu 6 detik agar user sempat membuang sampah
                print(">>> Menunggu {} detik...".format(DURASI_BUKA_DETIK))
                time.sleep(DURASI_BUKA_DETIK)

                print(">>> Menutup kembali (0 deg)...")
                servo_smooth(SUDUT_TUTUP, delay_ms=15, step=2)
                release_servo()  # Rilekskan motor saat tertutup
                
                # Jeda 1 detik agar tidak langsung terpicu ulang
                print(">>> Siap kembali.\n")
                time.sleep(1)
        else:
            print("Jarak:  ---   cm | Status: Standby")

        time.sleep_ms(150)

except KeyboardInterrupt:
    print("\nProgram dihentikan.")
    release_servo()
    servo_pwm.deinit()
