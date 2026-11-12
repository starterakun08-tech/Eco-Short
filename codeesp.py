try:
    from hx711 import HX711
except ImportError:
    from machine import Pin
    class HX711:
        def __init__(self, d_out, pd_sck, gain=128):
            self.d_out = Pin(d_out, Pin.IN)
            self.pd_sck = Pin(pd_sck, Pin.OUT)
            self.gain = gain
            self.offset = 0
            self.pd_sck.value(0)
        def is_ready(self):
            return self.d_out.value() == 0
        def read(self):
            start = time.ticks_ms()
            while not self.is_ready():
                if time.ticks_diff(time.ticks_ms(), start) > 500:
                    return None
            raw = 0
            for _ in range(24):
                self.pd_sck.value(1)
                raw = (raw << 1) | self.d_out.value()
                self.pd_sck.value(0)
            self.pd_sck.value(1)
            self.pd_sck.value(0)
            if raw & 0x800000:
                raw -= 0x1000000
            return raw
        def read_average(self, times=10):
            total, valid = 0, 0
            for _ in range(times):
                v = self.read()
                if v is not None:
                    total += v
                    valid += 1
                time.sleep_ms(3)
            return int(total / valid) if valid > 0 else 0
        def tare(self, times=15):
            self.offset = self.read_average(times)
            return self.offset
        def get_value(self):
            v = self.read()
            return (v - self.offset) if v is not None else None
from machine import Pin, PWM, time_pulse_us, reset  # type: ignore
import network  # type: ignore
import time
import urequests  # type: ignore

# Mock untuk Desktop Python agar tidak ada garis merah di VS Code
if not hasattr(time, 'ticks_ms'):
    time.ticks_ms = lambda: int(time.time() * 1000)
if not hasattr(time, 'ticks_diff'):
    time.ticks_diff = lambda a, b: a - b
if not hasattr(time, 'sleep_ms'):
    time.sleep_ms = lambda ms: time.sleep(ms / 1000.0)
if not hasattr(time, 'sleep_us'):
    time.sleep_us = lambda us: time.sleep(us / 1000000.0)

# --- KONFIGURASI PIN HARDWARE ---
# Sensor Ultrasonik 1 (Deteksi Tangan Depan - Buka Tutup)
TRIG_TANGAN_PIN = 19
ECHO_TANGAN_PIN = 21
trig_tangan = Pin(TRIG_TANGAN_PIN, Pin.OUT)
echo_tangan = Pin(ECHO_TANGAN_PIN, Pin.IN)

# Sensor Ultrasonik 2 (Volume Sampah Dalam Tong)
TRIG_VOL_PIN = 23
ECHO_VOL_PIN = 14
trig_vol = Pin(TRIG_VOL_PIN, Pin.OUT)
echo_vol = Pin(ECHO_VOL_PIN, Pin.IN)

# Servo MG995 (Penggerak Tutup Tempat Sampah)
SERVO_PIN = 18
servo_pwm = PWM(Pin(SERVO_PIN), freq=50)

# Sensor Berat Load Cell + Modul HX711
hx = HX711(d_out=4, pd_sck=5)

# --- PENGATURAN SERVO & TUTUP TONG ---
JARAK_DETEKSI_TANGAN_CM = 20   # Jarak deteksi tangan untuk membuka tutup (cm)
DURASI_TAHAN_DETIK = 5.0       # Durasi tutup tetap terbuka setelah tangan menjauh (detik)
SUDUT_TUTUP = 0                # Sudut servo saat tertutup rapat (derajat)
SUDUT_BUKA = 180               # Sudut servo saat terbuka penuh (180 derajat)

current_servo_angle = SUDUT_TUTUP
is_lid_open = False
last_hand_detected_ms = 0

# --- PENGATURAN SISTEM & SENSOR ---
FAKTOR_KALIBRASI = 423.5
AMBANG_PENUH_CM = 10
JARAK_KOSONG_CM = 35

WIFI_SSID = "S26 ULTRA"
WIFI_PASSWORD = "Bangkoks"

# ===== [DIUBAH] SERVER_URL mengarah ke hosting publik =====
SERVER_URL = "http://144.79.202.196:40122/api/iot/data"
# ===== [DITAMBAH] URL endpoint perintah dari dashboard =====
COMMAND_URL = "http://144.79.202.196:40122/api/iot/commands"
# ===== [DITAMBAH] Token autentikasi perangkat (Diambil dari Halaman Akun Dashboard) =====
DEVICE_TOKEN = "eco_token_12345"

DEVICE_ID = "esp32-ecosort-1"
SEND_INTERVAL_SECONDS = 1
HTTP_TIMEOUT_SECONDS = 3
LOOP_DELAY_MS = 250

HX_SAMPLE_COUNT = 1
HX_SAMPLE_DELAY_MS = 0

ULTRASONIC_SAMPLE_COUNT = 1
ULTRASONIC_SAMPLE_DELAY_MS = 0

WEIGHT_SMOOTHING_ALPHA_RISE = 0.45
WEIGHT_SMOOTHING_ALPHA_FALL = 0.85
DISTANCE_SMOOTHING_ALPHA = 0.50
ZERO_NOISE_GRAM = 3
WEIGH_START_GRAM = 25
WEIGH_END_GRAM = 10
WEIGH_CLEAR_SAMPLES = 1

MIN_VALID_DISTANCE_CM = 2
MAX_VALID_DISTANCE_CM = 300

wifi = network.WLAN(network.STA_IF)

smoothed_weight_gram = None
smoothed_distance_cm = None
total_weight_gram = 0
pending_weight_gram = 0
weight_event_active = False
weight_clear_count = 0

# Counter untuk polling perintah dan jeda reconnect WiFi
command_poll_counter = 0
COMMAND_POLL_EVERY = 5       # Cek perintah setiap 5x kirim data
last_wifi_retry_sec = 0
WIFI_RETRY_INTERVAL_SEC = 10 # Jeda antar percobaan sambung WiFi agar tidak memblokir servo


def get_wifi_error_message(st):
    """Menerjemahkan kode status WiFi ESP32 ke penjelasan yang mudah dipahami."""
    if st == 201:
        return "Hotspot TIDAK DITEMUKAN (Pastikan Hotspot di HP sudah AKTIF & band 2.4 GHz)"
    elif st == 202:
        return "PASSWORD SALAH (Cek huruf besar/kecil password WiFi)"
    elif st == 203:
        return "KONEKSI DITOLAK (Di HP: ubah Keamanan Hotspot dari WPA3 ke WPA2-Personal)"
    elif st == 1001:
        return "Timeout saat menyambung"
    return f"Status kode {st}"


def connect_wifi(timeout_sec=10):
    """Mencoba menghubungkan WiFi secara bersih dan tahan Wifi Internal State Error."""
    if wifi.isconnected():
        return True

    print(f"\n[WIFI] Menghubungkan ke '{WIFI_SSID}'...")

    # 1. Bersihkan sisa koneksi sebelumnya agar ESP-IDF tidak crash 'Wifi Internal State Error'
    try:
        wifi.disconnect()
    except Exception:
        pass

    try:
        wifi.active(False)
        time.sleep_ms(250)
        wifi.active(True)
        time.sleep_ms(350)
    except Exception:
        pass

    # 2. Panggil connect dengan proteksi error
    try:
        wifi.connect(WIFI_SSID, WIFI_PASSWORD)
    except OSError as e:
        print(f"[WIFI State] Reset radio WiFi ({e})...")
        try:
            wifi.active(False)
            time.sleep_ms(500)
            wifi.active(True)
            time.sleep_ms(500)
            wifi.connect(WIFI_SSID, WIFI_PASSWORD)
        except Exception as e2:
            print("[WIFI Error] Gagal connect:", e2)
            return False

    # 3. Tunggu hingga tersambung
    start_time = time.time()
    while (time.time() - start_time) < timeout_sec:
        if wifi.isconnected():
            print(f"[WIFI OK] Terhubung ke '{WIFI_SSID}'! IP ESP32: {wifi.ifconfig()[0]}\n")
            return True
        time.sleep_ms(400)

    # 4. Jika gagal, periksa kode statusnya
    try:
        st = wifi.status()
        print(f"[WIFI GAGAL] {get_wifi_error_message(st)}")
        print(">>> PERHATIAN HOTSPOT HP SAMSUNG:")
        print("    1. Pastikan Hotspot 'S26 ULTRA' AKTIF.")
        print("    2. Buka Pengaturan -> Sambungan -> Hotspot Seluler -> Konfigurasi.")
        print("    3. Ubah 'Pita Frekuensi' (Band) ke '2.4 GHz' (ESP32 tidak bisa 5 GHz!).")
        print("    4. Ubah 'Pengaman' (Security) ke 'WPA2-Personal'.\n")
    except Exception:
        print("[WIFI GAGAL] Timeout menyambung ke WiFi.")

    return False


# --- FUNGSI KONTROL SERVO MG995 ---
def set_servo_angle(angle):
    """Mengatur sudut servo (0 - 180 derajat) dengan batas aman standar MG995."""
    global current_servo_angle
    angle = max(0, min(180, int(angle)))
    current_servo_angle = angle
    # MG995 standar: 1000us (0 deg) s/d 2000us (180 deg) pada periode 20.000us (50Hz)
    pulse_us = 1000 + (angle / 180.0) * 1000
    duty = int((pulse_us / 20000.0) * 65535)
    servo_pwm.duty_u16(duty)


def move_servo_smooth(target_angle, step_delay_ms=8):
    """Menggerakkan servo secara bertahap agar gerakan halus & arus stabil."""
    global current_servo_angle
    target_angle = max(0, min(180, int(target_angle)))
    step = 4 if target_angle > current_servo_angle else -4
    for a in range(current_servo_angle, target_angle, step):
        set_servo_angle(a)
        time.sleep_ms(step_delay_ms)
    set_servo_angle(target_angle)


def release_servo():
    """Matikan sinyal PWM saat diam agar servo rileks, tidak panas & tidak mendengung."""
    servo_pwm.duty_u16(0)


def get_distance_raw(trig_p, echo_p):
    trig_p.value(0)
    time.sleep_us(5)
    trig_p.value(1)
    time.sleep_us(10)
    trig_p.value(0)

    try:
        duration = time_pulse_us(echo_p, 1, 35000)
        if duration <= 0:
            return None
        return (duration / 2.0) / 29.1
    except Exception:
        return None


def read_distance_filtered(trig_p, echo_p):
    samples = []
    for _ in range(2):
        jarak = get_distance_raw(trig_p, echo_p)
        if jarak is not None and MIN_VALID_DISTANCE_CM <= jarak <= MAX_VALID_DISTANCE_CM:
            samples.append(jarak)
        time.sleep_ms(15)

    if not samples:
        return None

    samples.sort()
    return samples[len(samples) // 2]


def read_distance_tangan():
    return read_distance_filtered(trig_tangan, echo_tangan)


def read_distance_volume():
    return read_distance_filtered(trig_vol, echo_vol)


def read_hx711_value():
    if hasattr(hx, "get_value"):
        return hx.get_value()
    if hasattr(hx, "read_average"):
        return hx.read_average()
    return hx.read()


def read_weight_gram():
    samples = []
    for _ in range(HX_SAMPLE_COUNT):
        try:
            raw = read_hx711_value()
            gram = raw / FAKTOR_KALIBRASI
            if abs(gram) < ZERO_NOISE_GRAM:
                gram = 0
            samples.append(max(0, gram))
        except Exception as e:
            print("HX711 error:", e)
        time.sleep_ms(HX_SAMPLE_DELAY_MS)

    if not samples:
        return None
    return sum(samples) / len(samples)


def apply_ema(prev, curr, alpha):
    if curr is None:
        return prev
    if prev is None:
        return curr
    return alpha * curr + (1 - alpha) * prev


def smooth_weight(prev, curr):
    if curr is None:
        return prev
    if prev is None:
        return curr
    alpha = WEIGHT_SMOOTHING_ALPHA_RISE if curr >= prev else WEIGHT_SMOOTHING_ALPHA_FALL
    return apply_ema(prev, curr, alpha)


def update_weight_total(total, pending, active, clear_count, curr):
    current = max(0, curr or 0)

    if not active and current >= WEIGH_START_GRAM:
        active = True
        pending = current
        clear_count = 0

    if active:
        if current > pending:
            pending = current

        if current <= WEIGH_END_GRAM:
            clear_count += 1
            if clear_count >= WEIGH_CLEAR_SAMPLES:
                total += pending
                pending = 0
                active = False
                clear_count = 0
        else:
            clear_count = 0

    # Tampilkan realtime agar cepat turun saat beban dilepas.
    # Akumulasi final tetap pakai pending (peak hold).
    displayed = total + (current if active else 0)
    return total, pending, active, clear_count, displayed


def format_weight_label(g):
    if g is None or g <= 0:
        return "0 g"
    if g < 1000:
        return "{:.1f} g".format(g)
    return "{:.2f} kg".format(g / 1000)


def send_to_dashboard(berat, jarak, berat_sensor, pending, total):
    global last_wifi_retry_sec

    if not wifi.isconnected():
        now_sec = time.time()
        # Jangan coba reconnect terus-menerus setiap detik agar servo tidak macet
        if (now_sec - last_wifi_retry_sec) >= WIFI_RETRY_INTERVAL_SEC:
            last_wifi_retry_sec = now_sec
            print("[WiFi Offline] Mencoba menyambung kembali...")
            connect_wifi(timeout_sec=3)
        return

    payload = {
        "deviceId": DEVICE_ID,
        # weightGram dipakai dashboard sebagai angka live utama.
        # Isi dengan nilai sensor realtime, bukan akumulasi event.
        "weightGram": round(berat_sensor or 0, 1),
        "totalWeightGram": round(total or 0, 1),
        "pendingWeightGram": round(pending or 0, 1),
        "currentWeightGram": round(berat_sensor or 0, 1),
        "resetWeight": True,
        "fullThresholdCm": AMBANG_PENUH_CM,
        "emptyDistanceCm": JARAK_KOSONG_CM
    }

    if jarak is not None:
        payload["distanceCm"] = round(jarak, 1)

    # ===== [DIUBAH] Tambah header autentikasi perangkat =====
    headers = {"X-Device-Token": DEVICE_TOKEN}

    for attempt in range(2):
        try:
            res = urequests.post(SERVER_URL, json=payload,
                                 headers=headers,
                                 timeout=HTTP_TIMEOUT_SECONDS)
            if res.status_code == 200:
                print(f"   >>> [HTTP 200 OK] Data terkirim ke Web Dashboard! (Berat: {payload['weightGram']}g, Kapasitas: {payload.get('distanceCm', '--')}cm)")
            else:
                print(f"   >>> [HTTP {res.status_code}] Ditolak server: {res.text}")
            res.close()
            return
        except Exception as e:
            print("   >>> [HTTP Error] Gagal kirim:", e, "| coba lagi..." if attempt == 0 else "")
            time.sleep_ms(300)


# ===== [DITAMBAH] Fungsi untuk mengambil & menjalankan perintah dari dashboard =====
def poll_and_execute_commands():
    """Ambil perintah dari server dan jalankan."""
    global FAKTOR_KALIBRASI, SEND_INTERVAL_SECONDS, total_weight_gram
    global pending_weight_gram, weight_event_active, weight_clear_count
    global smoothed_weight_gram

    if not wifi.isconnected():
        return

    url = COMMAND_URL + "?deviceId=" + DEVICE_ID
    headers = {"X-Device-Token": DEVICE_TOKEN}

    try:
        res = urequests.get(url, headers=headers, timeout=HTTP_TIMEOUT_SECONDS)
        if res.status_code == 200:
            data = res.json()
            commands = data.get("commands", [])
            for cmd in commands:
                cmd_type = cmd.get("type", "")
                params = cmd.get("params", {})
                print("[CMD] Terima:", cmd_type, params)

                if cmd_type == "tare":
                    # Tare / nol-kan timbangan
                    print("[CMD] Tare HX711...")
                    hx.tare()
                    smoothed_weight_gram = None
                    total_weight_gram = 0
                    pending_weight_gram = 0
                    weight_event_active = False
                    weight_clear_count = 0
                    print("[CMD] Tare selesai")

                elif cmd_type == "set_calibration":
                    # Ubah faktor kalibrasi
                    new_val = params.get("value")
                    if new_val is not None:
                        FAKTOR_KALIBRASI = float(new_val)
                        print("[CMD] FAKTOR_KALIBRASI =", FAKTOR_KALIBRASI)

                elif cmd_type == "set_interval":
                    # Ubah interval kirim data (detik)
                    new_val = params.get("value")
                    if new_val is not None:
                        SEND_INTERVAL_SECONDS = int(new_val)
                        print("[CMD] SEND_INTERVAL_SECONDS =", SEND_INTERVAL_SECONDS)

                elif cmd_type == "open_lid":
                    # Buka tutup tempat sampah dari dashboard
                    print("[CMD] Buka tutup tempat sampah...")
                    move_servo_smooth(SUDUT_BUKA)
                    is_lid_open = True
                    last_hand_detected_ms = time.ticks_ms()

                elif cmd_type == "close_lid":
                    # Tutup tempat sampah dari dashboard
                    print("[CMD] Tutup tempat sampah...")
                    move_servo_smooth(SUDUT_TUTUP)
                    time.sleep_ms(300)
                    release_servo()
                    is_lid_open = False

                elif cmd_type == "restart":
                    # Restart ESP32
                    print("[CMD] Restart ESP32...")
                    time.sleep(1)
                    reset()

                else:
                    print("[CMD] Perintah tidak dikenal:", cmd_type)

        res.close()
    except Exception as e:
        print("CMD poll error:", e)
# ===== [AKHIR TAMBAHAN] =====


print("Start system...")
connect_wifi()

print("Inisialisasi Servo MG995 (Tutup)...")
set_servo_angle(SUDUT_TUTUP)
time.sleep_ms(500)
release_servo()

print("Tare HX711...")
hx.tare()

print("Tare Ketinggian Dasar Tong Sampah...")
d_dasar = read_distance_volume()
if d_dasar is not None and d_dasar > 3.0:
    JARAK_KOSONG_CM = d_dasar
    print("-> Dasar tong terdeteksi: {:.1f} cm (Tinggi sampah diset = 0.0 cm)".format(JARAK_KOSONG_CM))
else:
    print("-> Menggunakan jarak dasar default: {:.1f} cm".format(JARAK_KOSONG_CM))

print("Ready\n")

while True:
    try:
        berat_raw = read_weight_gram()
        jarak_tangan = read_distance_tangan()
        jarak_vol_raw = read_distance_volume()

        # ===== KONTROL OTOMATIS TUTUP TEMPAT SAMPAH (SERVO MG995) =====
        now_ms = time.ticks_ms()
        # Jika sensor tangan mendeteksi adanya tangan mendekat
        if jarak_tangan is not None and jarak_tangan <= JARAK_DETEKSI_TANGAN_CM:
            last_hand_detected_ms = now_ms
            if not is_lid_open:
                print(">>> [TANGAN TERDETEKSI ({:.1f} cm)] MEMBUKA TUTUP TONG 180°...".format(jarak_tangan))
                move_servo_smooth(SUDUT_BUKA)
                is_lid_open = True
        else:
            # Jika tutup sedang terbuka dan tangan sudah menjauh melebihi DURASI_TAHAN_DETIK
            if is_lid_open and time.ticks_diff(now_ms, last_hand_detected_ms) > int(DURASI_TAHAN_DETIK * 1000):
                print(">>> [TANGAN MENJAUH] MENUTUP KEMBALI TUTUP TONG...")
                move_servo_smooth(SUDUT_TUTUP)
                time.sleep_ms(300)
                release_servo()
                is_lid_open = False
        # ===============================================================

        smoothed_weight_gram = smooth_weight(smoothed_weight_gram, berat_raw)
        smoothed_distance_cm = apply_ema(smoothed_distance_cm, jarak_vol_raw, DISTANCE_SMOOTHING_ALPHA)

        berat_sensor = smoothed_weight_gram or 0
        jarak = smoothed_distance_cm
        (
            total_weight_gram,
            pending_weight_gram,
            weight_event_active,
            weight_clear_count,
            berat
        ) = update_weight_total(
            total_weight_gram,
            pending_weight_gram,
            weight_event_active,
            weight_clear_count,
            berat_sensor
        )

        # Hitung Tinggi Sampah dari Dasar:
        tinggi_sampah = max(0.0, round(JARAK_KOSONG_CM - jarak, 1)) if jarak is not None else None

        vol_status = "🔴 PENUH" if (tinggi_sampah is not None and tinggi_sampah >= AMBANG_PENUH_CM) else ("🟡 TERISI" if (tinggi_sampah is not None and tinggi_sampah > 0.0) else "🟢 KOSONG")
        tangan_str = f"{jarak_tangan:5.1f} cm" if jarak_tangan is not None else " STANDBY"
        sampah_str = f"{tinggi_sampah:4.1f} cm" if tinggi_sampah is not None else " ---  "
        tutup_str = "BUKA 180°" if is_lid_open else "TUTUP 0° "
        print(f"Tangan: {tangan_str} | Sampah: {sampah_str} [{vol_status}] | Berat: {berat_sensor:5.1f} g | Tutup: {tutup_str}")

        now_sec = time.time()
        if "last_send_sec" not in globals():
            last_send_sec = 0
        if (now_sec - last_send_sec) >= SEND_INTERVAL_SECONDS:
            send_to_dashboard(berat, jarak, berat_sensor, pending_weight_gram, total_weight_gram)
            last_send_sec = now_sec

            # ===== [DITAMBAH] Poll perintah dari dashboard setiap beberapa siklus =====
            command_poll_counter += 1
            if command_poll_counter >= COMMAND_POLL_EVERY:
                poll_and_execute_commands()
                command_poll_counter = 0
            # ===== [AKHIR TAMBAHAN] =====

        time.sleep_ms(LOOP_DELAY_MS)
    except Exception as e:
        print("Loop error:", e)
        time.sleep(2)
