from hx711 import HX711
from machine import Pin, PWM, UART, reset
import network
import time
import urequests

# --- KONFIGURASI PIN HARDWARE ---
# Sensor Ultrasonik HC-SR04-RC (Chip RCWL-9616 - Mode UART)
# Sensor ini BUKAN HC-SR04 biasa! Menggunakan chip RCWL-9616 yang
# dikonfigurasi dalam mode UART (M1=1, M2=0 pada PCB).
# Pin Trig = TX sensor (GPIO 19) -> RX ESP32
# Pin Echo = RX sensor (GPIO 21) -> TX ESP32
SENSOR_RX_PIN = 19   # Trig pin sensor = TX sensor -> masuk ke RX ESP32
SENSOR_TX_PIN = 21   # Echo pin sensor = RX sensor -> keluar dari TX ESP32
SENSOR_BAUD = 9600   # Baud rate RCWL-9616 UART mode

# Inisialisasi UART untuk sensor ultrasonik RCWL-9616
sensor_uart = UART(1, baudrate=SENSOR_BAUD, rx=SENSOR_RX_PIN, tx=SENSOR_TX_PIN, timeout=300)

# Servo MG995 (Penggerak Tutup Tempat Sampah)
SERVO_PIN = 18
servo_pwm = PWM(Pin(SERVO_PIN), freq=50)

# Sensor Berat Load Cell + Modul HX711
hx = HX711(d_out=4, pd_sck=5)

# --- PENGATURAN SERVO & TUTUP TONG ---
JARAK_DETEKSI_TANGAN_CM = 20   # Jarak deteksi tangan untuk membuka tutup (cm)
DURASI_TAHAN_DETIK = 3.0       # Durasi tutup tetap terbuka setelah tangan menjauh (detik)
SUDUT_TUTUP = 0                # Sudut servo saat tertutup rapat (derajat)
SUDUT_BUKA = 90                # Sudut servo saat terbuka penuh (derajat)

current_servo_angle = SUDUT_TUTUP
is_lid_open = False
last_hand_detected_ms = 0

# --- PENGATURAN SISTEM & SENSOR ---
FAKTOR_KALIBRASI = 423.5
AMBANG_PENUH_CM = 10
JARAK_KOSONG_CM = 35

WIFI_SSID = "NAMA_WIFI_ANDA"
WIFI_PASSWORD = "PASSWORD_WIFI_ANDA"

# ===== [DIUBAH] SERVER_URL mengarah ke hosting publik =====
SERVER_URL = "http://144.79.202.196:40122/api/iot/data"
# ===== [DITAMBAH] URL endpoint perintah dari dashboard =====
COMMAND_URL = "http://144.79.202.196:40122/api/iot/commands"
# ===== [DITAMBAH] Token autentikasi perangkat (Diambil dari Halaman Akun Dashboard) =====
DEVICE_TOKEN = "ISI_TOKEN_DARI_PANEL"

DEVICE_ID = "esp32-ecosort-1"
SEND_INTERVAL_SECONDS = 1
HTTP_TIMEOUT_SECONDS = 3
LOOP_DELAY_MS = 120

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


def connect_wifi(timeout_sec=6):
    """Mencoba menghubungkan WiFi secara cepat tanpa memblokir sistem."""
    if wifi.isconnected():
        return True

    wifi.active(True)
    time.sleep_ms(100)

    print(f"Menghubungkan ke WiFi '{WIFI_SSID}'...")
    try:
        wifi.connect(WIFI_SSID, WIFI_PASSWORD)
    except Exception as e:
        print("Error koneksi WiFi:", e)
        return False

    start_time = time.time()
    while (time.time() - start_time) < timeout_sec:
        if wifi.isconnected():
            print("WiFi Terhubung! IP:", wifi.ifconfig()[0])
            return True
        time.sleep_ms(300)

    # Jika gagal, periksa statusnya
    try:
        st = wifi.status()
        print(f"WiFi belum terhubung: {get_wifi_error_message(st)}")
    except Exception:
        print("WiFi belum terhubung (timeout)")

    return False


# --- FUNGSI KONTROL SERVO MG995 ---
def set_servo_angle(angle):
    """Mengatur sudut servo (0 - 180 derajat) dengan batas aman."""
    global current_servo_angle
    angle = max(0, min(180, int(angle)))
    current_servo_angle = angle
    # MG995: 500us (0 deg) s/d 2500us (180 deg) pada periode 20.000us (50Hz)
    pulse_us = 500 + (angle / 180.0) * 2000
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


def get_distance_uart():
    """Membaca jarak dari sensor RCWL-9616 via UART.
    
    Protokol RCWL-9616 UART mode:
    - Sensor otomatis mengirim data terus-menerus (auto-transmit)
    - Format frame: [0xFF] [Jarak_High] [Jarak_Low] [Checksum]
    - Checksum = (0xFF + High + Low) & 0xFF
    - Jarak dalam milimeter = (High << 8) | Low
    """
    global _uart_buf
    
    # Baca semua data yang tersedia di buffer UART
    new_data = sensor_uart.read()
    if new_data:
        _uart_buf += new_data
    
    # Batasi buffer agar tidak membengkak (simpan 64 byte terakhir)
    if len(_uart_buf) > 64:
        _uart_buf = _uart_buf[-64:]
    
    # Cari frame valid terakhir (paling baru) dari belakang
    best_cm = None
    i = 0
    while i < len(_uart_buf) - 3:
        if _uart_buf[i] == 0xFF:
            high = _uart_buf[i+1]
            low = _uart_buf[i+2]
            checksum = _uart_buf[i+3]
            calc = (0xFF + high + low) & 0xFF
            if checksum == calc:
                jarak_mm = (high << 8) | low
                cm = jarak_mm / 10.0
                if 2 <= cm <= 300:
                    best_cm = cm
            i += 4
        else:
            i += 1
    
    # Buang data yang sudah diproses, simpan sisa yang belum lengkap
    if len(_uart_buf) >= 4:
        _uart_buf = _uart_buf[-3:]  # Simpan 3 byte terakhir (bisa jadi awal frame)
    
    return best_cm


# Buffer internal untuk data UART sensor
_uart_buf = bytearray()


def read_distance_cm():
    """Baca jarak sensor RCWL-9616 via UART, dengan 2x percobaan."""
    for _ in range(2):
        d = get_distance_uart()
        if d is not None:
            return d
        time.sleep_ms(50)  # Tunggu data UART masuk
    return None


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
            print("HTTP:", res.status_code)
            res.close()
            return
        except Exception as e:
            print("HTTP error:", e, "| retry", attempt + 1)
            time.sleep_ms(300)


# ===== [DITAMBAH] Fungsi untuk mengambil & menjalankan perintah dari dashboard =====
def poll_and_execute_commands():
    """Ambil perintah dari server dan jalankan."""
    global FAKTOR_KALIBRASI, SEND_INTERVAL_SECONDS, total_weight_gram
    global pending_weight_gram, weight_event_active, weight_clear_count
    global smoothed_weight_gram, is_lid_open, last_hand_detected_ms

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


print("========================================")
print("     SISTEM ECOSORT ESP32 DIMULAI")
print("========================================")
connect_wifi()

print("\n--- UJI MANDIRI PERANGKAT (SELF-TEST) ---")

# 1. Tes Gerakan Servo MG995
print("[1/3] Menguji Servo MG995 (Buka 45 deg lalu Tutup)...")
try:
    move_servo_smooth(45, step_delay_ms=10)
    time.sleep_ms(300)
    move_servo_smooth(SUDUT_TUTUP, step_delay_ms=10)
    time.sleep_ms(300)
    release_servo()
    print("      -> Servo MG995 Merespons OK!")
except Exception as e:
    print("      -> Gagal uji servo:", e)

# 2. Tes Load Cell HX711
print("[2/3] Menguji Load Cell + HX711 (Tare bobot nol)...")
try:
    hx.tare()
    print("      -> HX711 Siap & Nilai Nol Ditentukan!")
except Exception as e:
    print("      -> Gagal tare HX711:", e)

# 3. Tes Awal Ultrasonik (RCWL-9616 UART Mode)
print("[3/3] Menguji Sensor Ultrasonik RCWL-9616 (UART)...")
try:
    # Buang data lama di buffer UART
    sensor_uart.read()
    time.sleep_ms(300)  # Tunggu sensor mulai transmit
    test_d = read_distance_cm()
    if test_d is not None:
        print(f"      -> Objek terdeteksi pada: {test_d:.1f} cm")
    else:
        # Coba sekali lagi dengan waktu tunggu lebih lama
        time.sleep_ms(500)
        test_d = read_distance_cm()
        if test_d is not None:
            print(f"      -> Objek terdeteksi pada: {test_d:.1f} cm")
        else:
            print("      -> Area di depan sensor KOSONG (Standby / Normal).")
            print("         (Jika selalu kosong, coba baud rate 19200)")
except Exception as e:
    print("      -> Cek kabel ultrasonik:", e)

print("----------------------------------------")
print("Semua modul siap. Dekatkan tangan ke sensor (<= 20 cm) untuk membuka tutup.")
print("========================================\n")

while True:
    try:
        berat_raw = read_weight_gram()
        jarak_raw = read_distance_cm()

        # ===== KONTROL OTOMATIS TUTUP TEMPAT SAMPAH (SERVO MG995) =====
        now_ms = time.ticks_ms()
        # Jika sensor ultrasonik mendeteksi adanya tangan / benda mendekat (<= 20 cm)
        if jarak_raw is not None and jarak_raw <= JARAK_DETEKSI_TANGAN_CM:
            last_hand_detected_ms = now_ms
            if not is_lid_open:
                print(f">>> [TANGAN TERDETEKSI: {jarak_raw:.1f} cm] MEMBUKA TUTUP TONG...")
                move_servo_smooth(SUDUT_BUKA)
                is_lid_open = True
        else:
            # Jika tutup sedang terbuka dan tangan sudah menjauh melebihi DURASI_TAHAN_DETIK
            if is_lid_open and time.ticks_diff(now_ms, last_hand_detected_ms) > int(DURASI_TAHAN_DETIK * 1000):
                print(">>> [TANGAN MENJAUH] MENUTUP KEMBALI TUTUP TONG...")
                move_servo_smooth(SUDUT_TUTUP)
                time.sleep_ms(300)
                release_servo()  # Rilekskan motor servo agar tidak mendengung & tidak panas
                is_lid_open = False
        # ===============================================================

        smoothed_weight_gram = smooth_weight(smoothed_weight_gram, berat_raw)
        smoothed_distance_cm = apply_ema(smoothed_distance_cm, jarak_raw, DISTANCE_SMOOTHING_ALPHA)

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

        print("----------------------")
        print("Berat total:", format_weight_label(berat))
        print("Berat sensor (Load Cell):", format_weight_label(berat_sensor))
        if jarak_raw is not None:
            print(f"Jarak Tangan: {jarak_raw:.1f} cm")
        else:
            print("Jarak Tangan: Standby (Area Kosong / Tidak Ada Tangan)")
        print("Status Tutup:", "TERBUKA" if is_lid_open else "TERTUTUP")

        if jarak is not None and jarak <= AMBANG_PENUH_CM:
            print("STATUS: PENUH")
        elif jarak is None:
            print("STATUS: SENSOR STANDBY")
        else:
            print("STATUS: AMAN")

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
