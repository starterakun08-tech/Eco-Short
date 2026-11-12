"""
================================================================================
     ECOSORT SMART TRASH CAN - FIRMWARE ESP32 TERKALIBRASI DENGAN WEBSITE
================================================================================
Tersinkronisasi Penuh dengan Web Dashboard EcoSort IoT:
  1. Telemetri Real-time: Berat (g), Total Terkumpul (g), Volume/Jarak (cm), Kapasitas (%)
  2. Pencatatan Otomatis: Saat sampah dibuang dan tutup menutup, otomatis mencatat
     transaksi laporan baru (LP-xxxx) di web.
  3. Kontrol Jarak Jauh: Menerima perintah Tare, Ganti Faktor Kalibrasi, Ganti Interval,
     Buka/Tutup Servo, dan Restart langsung dari tombol kontrol Website.
  4. Ringan & Bebas 'Device Busy': Manajemen memori otomatis (gc.collect), non-blocking,
     dan bebas dari beban berlebih yang mengunci Thonny IDE.
================================================================================
"""

from machine import Pin, PWM, time_pulse_us, reset
import network
import time
import urequests
import gc

# ==============================================================================
# 1. KONFIGURASI SISTEM & SERVER WEBSITE
# ==============================================================================
WIFI_SSID       = "S26 ULTRA"
WIFI_PASSWORD   = "Bangkoks"

# PILIHAN ALAMAT SERVER:
# A. Jika dashboard berjalan di laptop Anda (dalam WiFi/Hotspot yang sama):
# Catatan: IP laptop saat ini terhubung ke WiFi adalah 192.168.110.254
SERVER_HOST     = "http://192.168.110.254:40122"

# B. Jika dashboard berjalan di server VPS publik (uncomment jika pakai VPS):
# SERVER_HOST   = "http://144.79.202.196:40122"

SERVER_URL      = f"{SERVER_HOST}/api/iot/data"
COMMAND_URL     = f"{SERVER_HOST}/api/iot/commands"
DEVICE_TOKEN    = "eco_token_12345"
DEVICE_ID       = "esp32-ecosort-1"

# Servo MG995 (Tutup Tong Sampah)
SERVO_PIN            = 18
SUDUT_TUTUP          = 0
SUDUT_BUKA           = 180
DURASI_BUKA_DETIK    = 5.0
JARAK_DETEKSI_TANGAN = 20.0  # Tangan <= 20 cm -> Buka tutup otomatis

# Sensor Ultrasonik 1 (Deteksi Tangan Pengguna di Depan)
TRIG_TANGAN_PIN = 19
ECHO_TANGAN_PIN = 21

# Sensor Ultrasonik 2 (Volume Sampah Dalam Tong)
TRIG_VOL_PIN        = 23
ECHO_VOL_PIN        = 14
AMBANG_PENUH_CM     = 10.0  # Jarak sensor ke sampah <= 10 cm = Tong PENUH
JARAK_DASAR_DEFAULT = 35.0  # Jarak dari sensor ke dasar tong kosong

# Load Cell HX711 (Timbangan Sampah)
HX_DT_PIN        = 4
HX_SCK_PIN       = 5
FAKTOR_KALIBRASI = 423.5   # Sesuaikan dengan nilai kalibrasi Anda
KAPASITAS_MAKSIMAL_BERAT_GRAM = 1000.0  # 1000 g (1 kg) batas kapasitas beban referensi tong sampah pintar

# Interval Waktu Operasional (Detik)
INTERVAL_KIRIM_DATA = 2.0   # Kirim status ke web tiap 2 detik
INTERVAL_POLL_CMD   = 3.0   # Cek remote command dari web tiap 3 detik

# ==============================================================================
# 2. INISIALISASI HARDWARE
# ==============================================================================
servo_pwm   = PWM(Pin(SERVO_PIN), freq=50)
trig_tangan = Pin(TRIG_TANGAN_PIN, Pin.OUT)
echo_tangan = Pin(ECHO_TANGAN_PIN, Pin.IN)
trig_vol    = Pin(TRIG_VOL_PIN, Pin.OUT)
echo_vol    = Pin(ECHO_VOL_PIN, Pin.IN)

class MiniHX711:
    """Driver HX711 Ringan & Akurat untuk ESP32"""
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
            if time.ticks_diff(time.ticks_ms(), t0) > 120:
                return None
            time.sleep_ms(1)
        raw = 0
        for _ in range(24):
            self.sck.value(1)
            raw = (raw << 1) | self.dt.value()
            self.sck.value(0)
        self.sck.value(1)  # Pulsa ke-25 pengatur gain 128
        self.sck.value(0)
        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def tare(self, n=8):
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
        # Toleransi noise: jika nilai di bawah 1.0g dianggap 0.0g
        return 0.0 if abs(gram) < 1.0 else max(0.0, gram)

    def get_stable_gram(self, faktor, samples=6):
        """Membaca sampel multi-timbangan dan membuang outlier agar bobot tidak naik-turun"""
        readings = []
        for _ in range(samples):
            g = self.get_gram(faktor)
            if g is not None:
                readings.append(g)
            time.sleep_ms(10)
        if not readings:
            return 0.0
        readings.sort()
        # Buang nilai ekstrem (terendah dan tertinggi)
        if len(readings) >= 4:
            readings = readings[1:-1]
        avg = sum(readings) / len(readings)
        return 0.0 if avg < 1.0 else round(avg, 1)

hx = MiniHX711(HX_DT_PIN, HX_SCK_PIN)
wifi = network.WLAN(network.STA_IF)

# ==============================================================================
# 3. FUNGSI DRIVER PERANGKAT
# ==============================================================================
def set_servo(angle):
    angle = max(0, min(180, int(angle)))
    pulse = 1000 + (angle / 180.0) * 1000
    duty = int((pulse / 20000.0) * 65535)
    servo_pwm.duty_u16(duty)

def release_servo():
    # Matikan sinyal PWM agar servo tidak panas dan tidak bergetar saat diam
    servo_pwm.duty_u16(0)

def move_servo_smooth(target_deg, current_deg):
    step = 6 if target_deg > current_deg else -6
    for deg in range(current_deg, target_deg, step):
        set_servo(deg)
        time.sleep_ms(7)
    set_servo(target_deg)

def read_sonar(trig, echo):
    trig.value(0)
    time.sleep_us(3)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    try:
        dur = time_pulse_us(echo, 1, 28000)
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            if 2.0 <= cm <= 350.0:
                return round(cm, 1)
    except Exception:
        pass
    return None

def connect_wifi():
    if wifi.isconnected():
        return True
    print(f"\n[WIFI] Menghubungkan ke '{WIFI_SSID}'...")
    try:
        wifi.active(False)
        time.sleep_ms(150)
        wifi.active(True)
        time.sleep_ms(150)
        wifi.connect(WIFI_SSID, WIFI_PASSWORD)
    except Exception:
        return False

    t_start = time.time()
    while (time.time() - t_start) < 7:
        if wifi.isconnected():
            print(f"[WIFI OK] Terhubung! IP ESP32: {wifi.ifconfig()[0]}")
            print(f"[SERVER] Mengarah ke: {SERVER_URL}\n")
            return True
        time.sleep_ms(300)
    print("[WIFI] Belum terhubung, mencoba ulang di background...")
    return False

def hitung_kapasitas_kolaborasi(tinggi_sampah, dasar_tong, berat_tetap):
    """
    KOLABORASI SENSOR (Sensor Fusion):
    Menggabungkan pembacaan tinggi dari Ultrasonik dan beban dari Load Cell.
    Kapasitas mencerminkan kondisi riil: baik sampah yang menggunung ringan
    ataupun sampah padat yang berbobot.
    """
    # 1. Persentase dari Ultrasonik (Tinggi / Volume)
    persen_vol = 0
    rentang_tinggi = max(5.0, dasar_tong - AMBANG_PENUH_CM)
    if tinggi_sampah > 0 and rentang_tinggi > 0:
        persen_vol = min(100, max(0, int((tinggi_sampah / rentang_tinggi) * 100)))

    # 2. Persentase dari Load Cell (Berat)
    persen_berat = min(100, max(0, int((berat_tetap / KAPASITAS_MAKSIMAL_BERAT_GRAM) * 100)))

    # 3. Kolaborasi: Saling melengkapi
    if berat_tetap > 0 or persen_vol > 0:
        return min(100, max(persen_vol, persen_berat))
    return 0

def kirim_data_ke_web(berat, tinggi_sampah, jarak_vol, total_berat, dasar_tong, persen_kapasitas=0, reset_weight=False):
    if not wifi.isconnected():
        return
    payload = {
        "deviceId": DEVICE_ID,
        "weightGram": round(berat, 1),
        "currentWeightGram": round(berat, 1),
        "totalWeightGram": round(total_berat, 1),
        "distanceCm": round(jarak_vol, 1) if jarak_vol is not None else None,
        "fullThresholdCm": AMBANG_PENUH_CM,
        "emptyDistanceCm": dasar_tong,
        "fillPercent": persen_kapasitas,
        "resetWeight": reset_weight
    }
    headers = {
        "Content-Type": "application/json",
        "X-Device-Token": DEVICE_TOKEN
    }
    try:
        res = urequests.post(SERVER_URL, json=payload, headers=headers, timeout=2.8)
        if res.status_code == 200:
            flag_tx = " [TRANSAKSI LAPORAN DICATAT]" if reset_weight else ""
            print(f"   >>> [HTTP 200 OK] Terkirim ke Web! Berat Tetap: {berat:.1f}g | Kapasitas Kolaborasi: {persen_kapasitas}%{flag_tx}")
        else:
            print(f"   >>> [HTTP {res.status_code}] Respon Server: {res.text}")
        res.close()
    except Exception as e:
        print(f"   >>> [HTTP Kirim Gagal] {e}")

def cek_perintah_dashboard():
    global FAKTOR_KALIBRASI, total_berat_akumulasi, INTERVAL_KIRIM_DATA, berat_sampah_tetap
    if not wifi.isconnected():
        return
    try:
        url = f"{COMMAND_URL}?deviceId={DEVICE_ID}"
        res = urequests.get(url, headers={"X-Device-Token": DEVICE_TOKEN}, timeout=2.5)
        if res.status_code == 200:
            data = res.json()
            commands = data.get("commands", [])
            for cmd in commands:
                ctype = cmd.get("type")
                params = cmd.get("params") or {}
                print(f"[REMOTE CMD] Perintah dari Dashboard: {ctype}")

                if ctype == "tare":
                    print("   >>> Eksekusi Tare Timbangan (Reset Nol)...")
                    hx.tare(10)
                    total_berat_akumulasi = 0.0
                    berat_sampah_tetap = 0.0
                    kirim_data_ke_web(0.0, 0.0, jarak_dasar_tong, 0.0, jarak_dasar_tong, persen_kapasitas=0)

                elif ctype in ("set_calibration", "calibrate"):
                    new_val = params.get("factor") or params.get("value") or cmd.get("value")
                    if new_val:
                        FAKTOR_KALIBRASI = float(new_val)
                        print(f"   >>> Faktor Kalibrasi Diperbarui ke: {FAKTOR_KALIBRASI}")

                elif ctype == "set_interval":
                    new_int = params.get("intervalSeconds") or params.get("seconds") or cmd.get("value")
                    if new_int:
                        INTERVAL_KIRIM_DATA = max(1.0, float(new_int))
                        print(f"   >>> Interval Pengiriman Diperbarui ke: {INTERVAL_KIRIM_DATA}s")

                elif ctype == "open_lid":
                    print("   >>> Buka Tutup dari Dashboard...")
                    move_servo_smooth(SUDUT_BUKA, SUDUT_TUTUP)

                elif ctype == "close_lid":
                    print("   >>> Tutup Tong dari Dashboard...")
                    move_servo_smooth(SUDUT_TUTUP, SUDUT_BUKA)
                    time.sleep_ms(200)
                    release_servo()

                elif ctype == "restart":
                    print("   >>> Melakukan Restart ESP32...")
                    time.sleep_ms(500)
                    reset()
        res.close()
    except Exception as e:
        pass

# ==============================================================================
# 4. SETUP AWAL
# ==============================================================================
print("==========================================")
print("   ECOSORT SMART TRASH CAN - TERKALIBRASI")
print("==========================================")

set_servo(SUDUT_TUTUP)
time.sleep_ms(300)
release_servo()

connect_wifi()

print("[INIT] Mengukur Titik Nol Timbangan (Tare)...")
hx.tare(8)

print("[INIT] Mengukur Tinggi Dasar Tong Sampah...")
d_dasar_sensor = read_sonar(trig_vol, echo_vol)
# Dasar tong kosong normalnya >= 18 cm. Jika < 18 cm (misal ada sampah), gunakan default 35 cm
jarak_dasar_tong = d_dasar_sensor if (d_dasar_sensor and d_dasar_sensor >= 18.0) else JARAK_DASAR_DEFAULT
print(f"[INIT] Jarak Dasar Tong Kosong: {jarak_dasar_tong:.1f} cm\n")

# ==============================================================================
# 5. LOOP UTAMA
# ==============================================================================
is_buka = False
t_terakhir_tangan = 0
sudut_sekarang = SUDUT_TUTUP
total_berat_akumulasi = 0.0
berat_sampah_tetap = 0.0  # KUNCI BOBOT TETAP: Berat sampah tidak akan pernah naik-turun!

last_send_time = 0
last_poll_time = 0
last_wifi_check = 0
last_manual_check = 0

while True:
    try:
        now_ms = time.ticks_ms()
        now_sec = time.time()

        # 1. Deteksi Tangan Pengguna
        jarak_tangan = read_sonar(trig_tangan, echo_tangan)

        if jarak_tangan is not None and jarak_tangan <= JARAK_DETEKSI_TANGAN:
            t_terakhir_tangan = now_ms
            if not is_buka:
                print(f"\n>>> [TANGAN {jarak_tangan:.1f} cm] Buka Tutup 180°...")
                move_servo_smooth(SUDUT_BUKA, sudut_sekarang)
                sudut_sekarang = SUDUT_BUKA
                is_buka = True
        else:
            # Jika tangan menjauh dan durasi buka habis -> Tutup kembali
            if is_buka and time.ticks_diff(now_ms, t_terakhir_tangan) > int(DURASI_BUKA_DETIK * 1000):
                print("\n>>> [TANGAN MENJAUH] Menutup Tong 0°...")
                move_servo_smooth(SUDUT_TUTUP, sudut_sekarang)
                sudut_sekarang = SUDUT_TUTUP
                time.sleep_ms(200)
                release_servo()
                is_buka = False

                # Tunggu getaran mekanis servo benar-benar reda sebelum mengukur
                time.sleep_ms(800)
                berat_stabil = hx.get_stable_gram(FAKTOR_KALIBRASI, 8)
                
                # Jika ada sampah baru yang masuk
                if berat_stabil > (berat_sampah_tetap + 1.0):
                    sampah_masuk = berat_stabil - berat_sampah_tetap
                    berat_sampah_tetap = berat_stabil  # Kunci berat secara tetap!
                    total_berat_akumulasi = berat_sampah_tetap
                    print(f"*** [SAMPAH MASUK] +{sampah_masuk:.1f} g | Berat Tetap Tong: {berat_sampah_tetap:.1f} g ***")
                    
                    # Baca ultrasonik dan kolaborasikan kapasitas
                    d_vol = read_sonar(trig_vol, echo_vol)
                    tinggi = max(0.0, round(jarak_dasar_tong - d_vol, 1)) if d_vol else 0.0
                    persen_kolab = hitung_kapasitas_kolaborasi(tinggi, jarak_dasar_tong, berat_sampah_tetap)
                    
                    # Langsung kirim trigger pencatatan ke tabel Laporan Web
                    kirim_data_ke_web(berat_sampah_tetap, tinggi, d_vol, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolab, reset_weight=True)

        # 2. Cek Sampah Masuk Tanpa Sensor Tangan (Manual Drop) Saat Tong Tertutup
        if not is_buka and (now_sec - last_manual_check) >= 4:
            last_manual_check = now_sec
            bacaan_cek = hx.get_stable_gram(FAKTOR_KALIBRASI, 4)
            if bacaan_cek > (berat_sampah_tetap + 3.0):
                sampah_masuk = bacaan_cek - berat_sampah_tetap
                berat_sampah_tetap = bacaan_cek
                total_berat_akumulasi = berat_sampah_tetap
                print(f"*** [SAMPAH MANUAL] +{sampah_masuk:.1f} g | Berat Tetap Tong: {berat_sampah_tetap:.1f} g ***")
                d_vol = read_sonar(trig_vol, echo_vol)
                tinggi = max(0.0, round(jarak_dasar_tong - d_vol, 1)) if d_vol else 0.0
                persen_kolab = hitung_kapasitas_kolaborasi(tinggi, jarak_dasar_tong, berat_sampah_tetap)
                kirim_data_ke_web(berat_sampah_tetap, tinggi, d_vol, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolab, reset_weight=True)

        # 3. Pembacaan Ultrasonik & Kolaborasi Kapasitas
        jarak_vol_live = read_sonar(trig_vol, echo_vol) if not is_buka else None
        tinggi_sampah = 0.0
        if jarak_vol_live is not None:
            tinggi_sampah = max(0.0, round(jarak_dasar_tong - jarak_vol_live, 1))

        persen_kolaborasi = hitung_kapasitas_kolaborasi(tinggi_sampah, jarak_dasar_tong, berat_sampah_tetap)
        status_tong = "🔴 PENUH" if persen_kolaborasi >= 80 else ("🟡 TERISI" if persen_kolaborasi > 0 else "🟢 KOSONG")

        # 4. Kirim Status Telemetri ke Web Dashboard secara Berkala
        # Nilai berat yang dikirim adalah `berat_sampah_tetap` sehingga TIDAK PERNAH NAIK-TURUN!
        if (now_sec - last_send_time) >= INTERVAL_KIRIM_DATA:
            tutup_str = "BUKA 180°" if is_buka else "TUTUP 0° "
            tangan_str = f"{jarak_tangan:4.1f} cm" if jarak_tangan else " STANDBY"
            print(f"Tangan: {tangan_str} | Kapasitas Kolaborasi: {persen_kolaborasi}% [{status_tong}] | Berat Tetap: {berat_sampah_tetap:5.1f}g | Tutup: {tutup_str}")

            kirim_data_ke_web(berat_sampah_tetap, tinggi_sampah, jarak_vol_live, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolaborasi)
            last_send_time = now_sec
            gc.collect()

        # 5. Ambil Perintah Jarak Jauh dari Web Dashboard
        if (now_sec - last_poll_time) >= INTERVAL_POLL_CMD:
            cek_perintah_dashboard()
            last_poll_time = now_sec

        # 6. Cek Koneksi Wi-Fi Otomatis jika Terputus
        if not wifi.isconnected() and (now_sec - last_wifi_check) >= 15:
            last_wifi_check = now_sec
            try:
                wifi.connect(WIFI_SSID, WIFI_PASSWORD)
            except Exception:
                pass

        time.sleep_ms(80)

    except KeyboardInterrupt:
        print("\n[STOP] Program dihentikan pengguna.")
        release_servo()
        break
    except Exception as e:
        print("Error Siklus:", e)
        time.sleep_ms(500)
