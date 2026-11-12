"""
================================================================================
     ECOSORT SMART TRASH CAN - FIRMWARE ESP32 (VERSI RINGAN & OPTIMAL)
================================================================================
Optimalisasi:
  1. Ringan & Cepat: Memori RAM dibersihkan otomatis (gc.collect) setiap siklus.
  2. Bebas "Device Busy": Tidak ada spam serial print berlebih yang mengunci Thonny.
  3. Non-blocking & Responsif: Deteksi tangan responsif tiap 100ms, kirim data tiap 2s.
  4. Proteksi Wi-Fi: Tidak mengunci servo saat hotspot terputus.
================================================================================
"""
try:
    from machine import Pin, PWM, time_pulse_us, reset  # type: ignore
    import network  # type: ignore
    import urequests  # type: ignore
except ImportError:
    # Mock untuk VS Code / Desktop Python agar tidak muncul garis merah
    class Pin:
        IN, OUT = 0, 1
        def __init__(self, p, m=None): pass
        def value(self, v=None): return 0
    class PWM:
        def __init__(self, p, freq=50): pass
        def duty_u16(self, d): pass
    def time_pulse_us(p, v, t): return 0
    def reset(): pass

import time
import gc

# ==============================================================================
# 1. KONFIGURASI PIN & PERANGKAT
# ==============================================================================
# Wi-Fi & Server VPS
WIFI_SSID       = "S26 ULTRA"
WIFI_PASSWORD   = "Bangkoks"
SERVER_URL      = "http://144.79.202.196:40122/api/iot/data"
COMMAND_URL     = "http://144.79.202.196:40122/api/iot/commands"
DEVICE_TOKEN    = "eco_token_12345"
DEVICE_ID       = "esp32-ecosort-1"

# Servo MG995 (Tutup Tong)
SERVO_PIN          = 18
SUDUT_TUTUP        = 0
SUDUT_BUKA         = 180
DURASI_BUKA_DETIK  = 5.0
JARAK_DETEKSI_TANGAN = 20.0  # Tangan <= 20 cm -> Buka tutup

# Ultrasonik 1 (Tangan Depan)
TRIG_TANGAN_PIN = 19
ECHO_TANGAN_PIN = 21

# Ultrasonik 2 (Volume Dalam Tong)
TRIG_VOL_PIN    = 23
ECHO_VOL_PIN    = 14
AMBANG_PENUH_CM = 10.0  # Tinggi sampah >= 10 cm = PENUH
JARAK_DASAR_DEFAULT = 30.0

# Load Cell HX711 (Timbangan)
HX_DT_PIN        = 4
HX_SCK_PIN       = 5
FAKTOR_KALIBRASI = 423.5

# Waktu interval (Detik)
INTERVAL_KIRIM_DATA = 2.0   # Kirim data ke web tiap 2 detik (enteng & stabil)
INTERVAL_POLL_CMD   = 6.0   # Cek remote command dari web tiap 6 detik

# ==============================================================================
# 2. INISIALISASI HARDWARE
# ==============================================================================
servo_pwm   = PWM(Pin(SERVO_PIN), freq=50)
trig_tangan = Pin(TRIG_TANGAN_PIN, Pin.OUT)
echo_tangan = Pin(ECHO_TANGAN_PIN, Pin.IN)
trig_vol    = Pin(TRIG_VOL_PIN, Pin.OUT)
echo_vol    = Pin(ECHO_VOL_PIN, Pin.IN)

class MiniHX711:
    """Driver HX711 Super Ringan & Hemat RAM"""
    def __init__(self, dt_pin, sck_pin):
        self.dt = Pin(dt_pin, Pin.IN)
        self.sck = Pin(sck_pin, Pin.OUT)
        self.sck.value(0)
        self.offset = 0

    def is_ready(self):
        return self.dt.value() == 0

    def read(self):
        t0 = time.ticks_ms()
        while not self.is_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                return None
            time.sleep_ms(1)
        raw = 0
        for _ in range(24):
            self.sck.value(1)
            raw = (raw << 1) | self.dt.value()
            self.sck.value(0)
        self.sck.value(1)  # Pulsa ke-25
        self.sck.value(0)
        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def tare(self, n=5):
        vals = [self.read() for _ in range(n)]
        valid = [v for v in vals if v is not None]
        if valid:
            self.offset = sum(valid) // len(valid)
        return self.offset

    def get_gram(self, faktor):
        r = self.read()
        if r is None:
            return None
        gram = (r - self.offset) / faktor
        return 0.0 if abs(gram) < 3.0 else max(0.0, gram)

hx = MiniHX711(HX_DT_PIN, HX_SCK_PIN)
wifi = network.WLAN(network.STA_IF)

# ==============================================================================
# 3. FUNGSI DRIVER (SERVO, SENSOR, WIFI)
# ==============================================================================
def set_servo(angle):
    """Atur sudut servo MG995 (0 - 180 derajat)"""
    angle = max(0, min(180, int(angle)))
    pulse = 1000 + (angle / 180.0) * 1000  # 1000us - 2000us
    duty = int((pulse / 20000.0) * 65535)
    servo_pwm.duty_u16(duty)

def release_servo():
    """Rilekskan servo agar tidak panas dan tidak mendengung"""
    servo_pwm.duty_u16(0)

def move_servo_smooth(target_deg, current_deg):
    """Gerakan bertahap agar arus servo halus dan tidak drop tegangan"""
    step = 5 if target_deg > current_deg else -5
    for deg in range(current_deg, target_deg, step):
        set_servo(deg)
        time.sleep_ms(6)
    set_servo(target_deg)

def read_sonar(trig, echo):
    """Baca jarak HC-SR04 (cm) dengan timeout aman"""
    trig.value(0)
    time.sleep_us(3)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    try:
        dur = time_pulse_us(echo, 1, 25000)  # Max ~400 cm
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            if 2.0 <= cm <= 300.0:
                return round(cm, 1)
    except Exception:
        pass
    return None

def connect_wifi():
    """Sambungkan ke Wi-Fi Hotspot tanpa membekukan sistem"""
    if wifi.isconnected():
        return True
    print(f"\n[WIFI] Menghubungkan ke '{WIFI_SSID}'...")
    try:
        wifi.active(False)
        time.sleep_ms(200)
        wifi.active(True)
        time.sleep_ms(200)
        wifi.connect(WIFI_SSID, WIFI_PASSWORD)
    except Exception:
        return False

    t_start = time.time()
    while (time.time() - t_start) < 7:
        if wifi.isconnected():
            print(f"[WIFI OK] IP: {wifi.ifconfig()[0]}\n")
            return True
        time.sleep_ms(300)
    print("[WIFI] Belum terhubung, akan dicoba di background.")
    return False

# ==============================================================================
# 4. KOMUNIKASI WEB DASHBOARD (HTTP POST & GET)
# ==============================================================================
def kirim_data_ke_web(berat, tinggi_sampah, jarak_vol, total_berat, dasar_tong):
    """Kirim data telemetri ke server VPS via HTTP POST"""
    if not wifi.isconnected():
        return
    payload = {
        "deviceId": DEVICE_ID,
        "weightGram": round(berat, 1),
        "totalWeightGram": round(total_berat, 1),
        "distanceCm": round(jarak_vol, 1) if jarak_vol is not None else None,
        "fullThresholdCm": AMBANG_PENUH_CM,
        "emptyDistanceCm": dasar_tong
    }
    headers = {
        "Content-Type": "application/json",
        "X-Device-Token": DEVICE_TOKEN
    }
    try:
        res = urequests.post(SERVER_URL, json=payload, headers=headers, timeout=2.5)
        if res.status_code == 200:
            print(f"   >>> [HTTP 200] Terkirim! Berat: {berat:.1f}g | Sampah: {tinggi_sampah:.1f}cm")
        else:
            print(f"   >>> [HTTP {res.status_code}] Respon server: {res.text}")
        res.close()
    except Exception as e:
        print(f"   >>> [HTTP Error] Gagal kirim: {e}")

def cek_perintah_dashboard():
    """Polling perintah remote (Tare, Buka Tutup, dll)"""
    global FAKTOR_KALIBRASI, total_berat_akumulasi
    if not wifi.isconnected():
        return
    try:
        res = urequests.get(f"{COMMAND_URL}?deviceId={DEVICE_ID}", 
                            headers={"X-Device-Token": DEVICE_TOKEN}, timeout=2.5)
        if res.status_code == 200:
            data = res.json()
            for cmd in data.get("commands", []):
                ctype = cmd.get("type")
                print(f"[CMD] Eksekusi: {ctype}")
                if ctype == "tare":
                    hx.tare(8)
                    total_berat_akumulasi = 0.0
                elif ctype == "open_lid":
                    move_servo_smooth(SUDUT_BUKA, SUDUT_TUTUP)
                elif ctype == "close_lid":
                    move_servo_smooth(SUDUT_TUTUP, SUDUT_BUKA)
                    time.sleep_ms(200)
                    release_servo()
                elif ctype == "restart":
                    reset()
        res.close()
    except Exception:
        pass

# ==============================================================================
# 5. INISIALISASI & KALIBRASI AWAL
# ==============================================================================
print("==========================================")
print("   ECOSORT SMART TRASH CAN - READY")
print("==========================================")

# Tutup servo & rilekskan
set_servo(SUDUT_TUTUP)
time.sleep_ms(400)
release_servo()

# Sambungkan Wi-Fi
connect_wifi()

# Kalibrasi Timbangan & Dasar Tong
print("[INIT] Tare Timbangan...")
hx.tare(8)

print("[INIT] Tare Jarak Dasar Tong...")
d_dasar_sensor = read_sonar(trig_vol, echo_vol)
jarak_dasar_tong = d_dasar_sensor if (d_dasar_sensor and d_dasar_sensor > 5.0) else JARAK_DASAR_DEFAULT
print(f"[INIT] Dasar Tong: {jarak_dasar_tong:.1f} cm")
print("Sistem berjalan normal. Silakan dekati tangan untuk membuka tutup.\n")

# ==============================================================================
# 6. LOOP UTAMA (RINGAN, CEPAT, NON-BLOCKING)
# ==============================================================================
is_buka = False
t_terakhir_tangan = 0
sudut_sekarang = SUDUT_TUTUP
total_berat_akumulasi = 0.0

last_send_time = 0
last_poll_time = 0
last_wifi_check = 0

while True:
    try:
        now_ms = time.ticks_ms()
        now_sec = time.time()

        # 1. Baca Sensor Tangan Depan (Cepat)
        jarak_tangan = read_sonar(trig_tangan, echo_tangan)

        # 2. Logika Buka / Tutup Otomatis
        if jarak_tangan is not None and jarak_tangan <= JARAK_DETEKSI_TANGAN:
            t_terakhir_tangan = now_ms
            if not is_buka:
                print(f"\n>>> [TANGAN {jarak_tangan:.1f} cm] MEMBUKA TUTUP 180°...")
                move_servo_smooth(SUDUT_BUKA, sudut_sekarang)
                sudut_sekarang = SUDUT_BUKA
                is_buka = True
        else:
            if is_buka and time.ticks_diff(now_ms, t_terakhir_tangan) > int(DURASI_BUKA_DETIK * 1000):
                print("\n>>> [TANGAN MENJAUH] MENUTUP TUTUP 0°...")
                move_servo_smooth(SUDUT_TUTUP, sudut_sekarang)
                sudut_sekarang = SUDUT_TUTUP
                time.sleep_ms(200)
                release_servo()  # Rilekskan motor servo
                is_buka = False

        # 3. Baca Sensor Berat & Volume
        berat_live = hx.get_gram(FAKTOR_KALIBRASI) or 0.0
        
        # Saat tutup terbuka, tahan pembacaan volume agar tidak terganggu pantulan tutup/tangan
        if not is_buka:
            jarak_vol_live = read_sonar(trig_vol, echo_vol)
        else:
            jarak_vol_live = None

        tinggi_sampah = 0.0
        if jarak_vol_live is not None:
            tinggi_sampah = max(0.0, round(jarak_dasar_tong - jarak_vol_live, 1))

        status_tong = "🔴 PENUH" if tinggi_sampah >= AMBANG_PENUH_CM else ("🟡 TERISI" if tinggi_sampah > 0 else "🟢 KOSONG")

        # 4. Kirim Data ke Web Dashboard (Setiap INTERVAL_KIRIM_DATA detik)
        if (now_sec - last_send_time) >= INTERVAL_KIRIM_DATA:
            tutup_str = "BUKA 180°" if is_buka else "TUTUP 0° "
            tangan_str = f"{jarak_tangan:4.1f} cm" if jarak_tangan else " STANDBY"
            print(f"Tangan: {tangan_str} | Sampah: {tinggi_sampah:4.1f} cm [{status_tong}] | Berat: {berat_live:5.1f} g | Tutup: {tutup_str}")

            kirim_data_ke_web(berat_live, tinggi_sampah, jarak_vol_live, total_berat_akumulasi, jarak_dasar_tong)
            last_send_time = now_sec

            # Bersihkan memori RAM agar ESP32 tetap enteng & tidak pernah crash
            gc.collect()

        # 5. Cek Perintah dari Dashboard (Setiap INTERVAL_POLL_CMD detik)
        if (now_sec - last_poll_time) >= INTERVAL_POLL_CMD:
            cek_perintah_dashboard()
            last_poll_time = now_sec

        # 6. Auto-reconnect Wi-Fi jika terputus (Cek setiap 15 detik tanpa bikin macet)
        if not wifi.isconnected() and (now_sec - last_wifi_check) >= 15:
            last_wifi_check = now_sec
            try:
                wifi.connect(WIFI_SSID, WIFI_PASSWORD)
            except Exception:
                pass

        # Jeda loop santai agar CPU ESP32 adem dan Thonny mudah menangkap Ctrl+C
        time.sleep_ms(80)

    except KeyboardInterrupt:
        print("\n[STOP] Program dihentikan pengguna.")
        release_servo()
        break
    except Exception as e:
        print("Loop error:", e)
        time.sleep_ms(500)
