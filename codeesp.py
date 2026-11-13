"""
================================================================================
     ECOSORT SMART TRASH CAN - FIRMWARE ESP32 TERKALIBRASI DENGAN WEBSITE
================================================================================
Tersinkronisasi Penuh dengan Web Dashboard EcoSort IoT:
  1. Kalibrasi Beban Mati (Tare): Mengukur & mengenolkan berat fisik tong sampah,
     motor servo MG995, tutup, braket, dan kabel secara akurat saat booting.
  2. Penguncian Bobot Sampah (Berat Tetap / Anti Naik-Turun): Nilai berat sampah
     terkunci stabil dan tidak berfluktuasi/jitter akibat getaran servo atau angin.
  3. Kolaborasi Sensor Cerdas (Sensor Fusion): Menggabungkan Ultrasonik & Load Cell.
     Jika tong kosong (berat ~0g), kapasitas tidak akan pernah salah baca 100% PENUH.
     Saat sampah masuk, kapasitas menyesuaikan tinggi volume dan berat secara proporsional.
  4. Non-Blocking Network: Jika WiFi/Server belum terhubung, Servo & Sensor Tangan
     TETAP BERJALAN lancar tanpa jeda/freeze (anti-lag).
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

# ALAMAT SERVER LAPTOP:
# Laptop saat ini terhubung ke jaringan dengan IP: 192.168.110.254
SERVER_HOST     = "http://192.168.110.254:40122"

SERVER_URL      = f"{SERVER_HOST}/api/iot/data"
COMMAND_URL     = f"{SERVER_HOST}/api/iot/commands"
DEVICE_TOKEN    = "eco_token_12345"
DEVICE_ID       = "esp32-ecosort-1"

# Servo MG995 (Tutup Tong Sampah)
SERVO_PIN            = 18
SUDUT_TUTUP          = 0
SUDUT_BUKA           = 180
DURASI_BUKA_DETIK    = 4.5
JARAK_DETEKSI_TANGAN = 35.0  # Tangan <= 35 cm -> Buka tutup otomatis (responsif)

# PIN SENSOR ULTRASONIK:
# Opsi tukar pin: Ubah ke True jika kabel sensor tangan & sensor dalam tong tertukar di breadboard
TUKAR_PIN_SENSOR = False

TRIG_TANGAN_PIN = 19 if not TUKAR_PIN_SENSOR else 23
ECHO_TANGAN_PIN = 21 if not TUKAR_PIN_SENSOR else 14

TRIG_VOL_PIN    = 23 if not TUKAR_PIN_SENSOR else 19
ECHO_VOL_PIN    = 14 if not TUKAR_PIN_SENSOR else 21

AMBANG_PENUH_CM     = 10.0  # Jarak sensor ke sampah <= 10 cm = Tong PENUH
JARAK_DASAR_DEFAULT = 35.0  # Jarak dari sensor ke dasar tong kosong (cm)

# Load Cell HX711 (Timbangan Sampah)
HX_DT_PIN        = 4
HX_SCK_PIN       = 5
FAKTOR_KALIBRASI = 423.5   # Nilai kalibrasi timbangan Anda
KAPASITAS_MAKSIMAL_BERAT_GRAM = 1000.0  # 1000 g (1 kg) batas kapasitas beban referensi tong pintar

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
    """Driver HX711 Presisi Tinggi untuk Kalibrasi Beban Mati & Berat Bersih"""
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
        self.sck.value(1)  # Pulsa ke-25: gain 128 channel A
        self.sck.value(0)
        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def tare(self, n=20):
        """
        Kalibrasi Beban Mati (Tare):
        Mengambil 20 sampel, membuang nilai ekstrem atas dan bawah (trimmed mean),
        lalu merata-ratakan nilai tengah untuk mengenolkan berat fisik tong,
        servo MG995, tutup, baut, dan kabel secara akurat.
        """
        samples = []
        for _ in range(n):
            val = self.read()
            if val is not None:
                samples.append(val)
            time.sleep_ms(10)
        
        if not samples:
            return self.offset

        samples.sort()
        # Buang outlier 25% terbawah dan 25% teratas jika sampel cukup
        if len(samples) >= 8:
            cut = len(samples) // 4
            trimmed = samples[cut:-cut]
        else:
            trimmed = samples

        self.offset = sum(trimmed) // len(trimmed)
        return self.offset

    def get_gram(self, faktor):
        r = self.read()
        if r is None:
            return None
        gram = (r - self.offset) / faktor
        # Toleransi deadband noise nol
        return 0.0 if abs(gram) < 1.0 else max(0.0, gram)

    def get_stable_gram(self, faktor, samples=8):
        """
        Membaca multi-sampel dan menyaring noise mekanis/elektrik
        agar nilai timbangan bersih tidak goyang/naik-turun.
        """
        readings = []
        for _ in range(samples):
            g = self.get_gram(faktor)
            if g is not None:
                readings.append(g)
            time.sleep_ms(10)
        
        if not readings:
            return 0.0

        readings.sort()
        # Ambil median / trimmed mean
        if len(readings) >= 6:
            trimmed = readings[2:-2]
        elif len(readings) >= 4:
            trimmed = readings[1:-1]
        else:
            trimmed = readings

        avg = sum(trimmed) / len(trimmed)
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
    # Matikan sinyal PWM agar motor servo tidak bergetar dan tidak mengganggu timbangan
    servo_pwm.duty_u16(0)

def move_servo_smooth(target_deg, current_deg):
    step = 7 if target_deg > current_deg else -7
    for deg in range(current_deg, target_deg, step):
        set_servo(deg)
        time.sleep_ms(6)
    set_servo(target_deg)

def read_sonar_raw(trig, echo):
    trig.value(0)
    time.sleep_us(3)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    try:
        dur = time_pulse_us(echo, 1, 25000)
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            if 3.0 <= cm <= 350.0:
                return round(cm, 1)
    except Exception:
        pass
    return None

def read_sonar_median(trig, echo, samples=3):
    """Filter median untuk sensor ultrasonik agar kebal pantulan dinding sempit"""
    readings = []
    for _ in range(samples):
        d = read_sonar_raw(trig, echo)
        if d is not None:
            readings.append(d)
        time.sleep_ms(12)
    if not readings:
        return None
    readings.sort()
    return readings[len(readings) // 2]

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
    while (time.time() - t_start) < 5:
        if wifi.isconnected():
            print(f"[WIFI OK] Terhubung! IP ESP32: {wifi.ifconfig()[0]}")
            print(f"[SERVER] Mengarah ke: {SERVER_URL}\n")
            return True
        time.sleep_ms(250)
    print("[WIFI] Belum terhubung, mencoba di background...")
    return False

def hitung_kapasitas_kolaborasi(tinggi_sampah, dasar_tong, berat_tetap, jarak_vol):
    """
    KOLABORASI SENSOR CERDAS (Sensor Fusion: Ultrasonik + Load Cell):
    1. Jika berat tetap <= 1.5g (tong kosong), kapasitas PASTI 0% [🟢 KOSONG].
       Ini mencegah pantulan palsu dari dinding silinder tong membaca 100% PENUH saat tong kosong!
    2. Jika ada sampah masuk (berat > 1.5g):
       - Hitung persentase kapasitas berdasarkan volume tinggi (Ultrasonik).
       - Hitung persentase kapasitas berdasarkan massa berat (Load Cell).
       - Kolaborasikan keduanya secara proporsional (60% volume + 40% berat).
       - Terapkan pembatasan cerdas: sampah sangat ringan (< 50g) tidak akan langsung melonjak ke 100%.
    """
    # 1. Proteksi tong kosong: Jika timbangan mendeteksi tidak ada sampah, kapasitas = 0%
    if berat_tetap <= 1.5:
        return 0

    # 2. Persentase berdasarkan berat (0 - 100%)
    persen_berat = min(100, max(0, int((berat_tetap / KAPASITAS_MAKSIMAL_BERAT_GRAM) * 100)))

    # 3. Persentase berdasarkan volume tinggi ultrasonik
    persen_vol = None
    if jarak_vol is not None and jarak_vol >= 3.5:
        rentang_tinggi = max(8.0, dasar_tong - AMBANG_PENUH_CM)
        if tinggi_sampah > 0 and rentang_tinggi > 0:
            persen_vol = min(100, max(0, int((tinggi_sampah / rentang_tinggi) * 100)))

    # 4. Kolaborasi Sensor (Fusion)
    if persen_vol is None:
        # Jika sensor ultrasonik blind spot atau terhalang kabel, gunakan persen berat
        kapasitas = persen_berat
    else:
        # Padukan: 60% Volume Ruang + 40% Beban Berat
        kapasitas = int(round(0.6 * persen_vol + 0.4 * persen_berat))

    # 5. Batasan Cerdas (Sanity Clamping):
    # - Jika berat masih sangat ringan (< 5% atau < 50g), batasi maksimal kapasitas 40%
    #   agar selembar kertas / pantulan dinding tidak membuat tong dikira 100% penuh.
    if persen_berat < 5:
        kapasitas = min(kapasitas, 40)

    # - Jika salah satu sensor sudah mencapai batas kepenuhan ekstrem (>= 90%) dan ada beban nyata
    if persen_berat >= 90 or (persen_vol is not None and persen_vol >= 90 and berat_tetap >= 15.0):
        kapasitas = max(kapasitas, 90)

    return min(100, max(0, kapasitas))

last_http_fail_time = 0

def kirim_data_ke_web(berat, tinggi_sampah, jarak_vol, total_berat, dasar_tong, persen_kapasitas=0, reset_weight=False):
    global last_http_fail_time
    if not wifi.isconnected():
        return
    now_s = time.time()
    # Jika koneksi HTTP gagal (timeout), tunda percobaan 5 detik agar servo tidak terganggu
    if (now_s - last_http_fail_time) < 5 and not reset_weight:
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
        # Timeout 1.0 detik agar tidak memblokir respon servo & deteksi tangan
        res = urequests.post(SERVER_URL, json=payload, headers=headers, timeout=1.0)
        if res.status_code == 200:
            flag_tx = " [TRANSAKSI LAPORAN DICATAT]" if reset_weight else ""
            print(f"   >>> [HTTP 200 OK] Terkirim ke Web! Berat: {berat:.1f}g | Kapasitas: {persen_kapasitas}%{flag_tx}")
            last_http_fail_time = 0
        else:
            print(f"   >>> [HTTP {res.status_code}] Respon Server: {res.text}")
        res.close()
    except Exception as e:
        last_http_fail_time = now_s
        print(f"   >>> [HTTP Kirim Gagal] {e} (Tunda HTTP 5s agar servo tetap lancar)")

def cek_perintah_dashboard():
    global FAKTOR_KALIBRASI, total_berat_akumulasi, INTERVAL_KIRIM_DATA, berat_sampah_tetap, last_http_fail_time
    if not wifi.isconnected():
        return
    now_s = time.time()
    if (now_s - last_http_fail_time) < 5:
        return
    try:
        url = f"{COMMAND_URL}?deviceId={DEVICE_ID}"
        res = urequests.get(url, headers={"X-Device-Token": DEVICE_TOKEN}, timeout=1.0)
        if res.status_code == 200:
            data = res.json()
            commands = data.get("commands", [])
            for cmd in commands:
                ctype = cmd.get("type")
                params = cmd.get("params") or {}
                print(f"[REMOTE CMD] Perintah dari Dashboard: {ctype}")

                if ctype == "tare":
                    print("   >>> Eksekusi Tare Timbangan (Kalibrasi Beban Tong & Komponen)...")
                    release_servo()
                    time.sleep_ms(800)
                    hx.tare(20)
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
    except Exception:
        last_http_fail_time = now_s

# ==============================================================================
# 4. SETUP AWAL & KALIBRASI BEBAN MATI (TONG & KOMPONEN)
# ==============================================================================
print("=================================================================")
print("   ECOSORT SMART TRASH CAN - TERKALIBRASI BEBAN MATI & FUSION")
print("=================================================================")

# Pastikan servo tertutup rapat dan bebas beban arus listrik (diam)
set_servo(SUDUT_TUTUP)
time.sleep_ms(400)
release_servo()

connect_wifi()

# Kalibrasi Beban Mati (Tare): Mengenolkan berat tong, tutup servo, braket, dan kabel
print("\n[INIT] Menstabilkan getaran mekanis tong...")
time.sleep_ms(1200)
print("[INIT] Mengukur & Mengalibrasi Beban Mati Tong + Komponen (Tare)...")
hx.tare(25)
print(f"[INIT] Titik Nol Terkalibrasi! Nilai Offset: {hx.offset}")

print("[INIT] Mengukur Tinggi Dasar Tong Sampah...")
d_dasar_sensor = read_sonar_median(trig_vol, echo_vol, samples=5)
# Dasar tong kosong normalnya >= 18 cm. Jika < 18 cm, gunakan JARAK_DASAR_DEFAULT
jarak_dasar_tong = d_dasar_sensor if (d_dasar_sensor and d_dasar_sensor >= 18.0) else JARAK_DASAR_DEFAULT
print(f"[INIT] Jarak Dasar Tong Kosong: {jarak_dasar_tong:.1f} cm\n")

# ==============================================================================
# 5. LOOP UTAMA
# ==============================================================================
is_buka = False
t_terakhir_tangan = 0
sudut_sekarang = SUDUT_TUTUP
total_berat_akumulasi = 0.0

# PENGUNCIAN BOBOT: Berat sampah dipertahankan secara tetap (tidak naik-turun)
berat_sampah_tetap = 0.0

last_send_time = 0
last_poll_time = 0
last_wifi_check = 0
last_manual_check = 0

while True:
    try:
        now_ms = time.ticks_ms()
        now_sec = time.time()

        # 1. Deteksi Tangan Pengguna di Depan Sensor Ultrasonik Tangan
        jarak_tangan = read_sonar_raw(trig_tangan, echo_tangan)

        if jarak_tangan is not None and jarak_tangan <= JARAK_DETEKSI_TANGAN:
            t_terakhir_tangan = now_ms
            if not is_buka:
                print(f"\n>>> [TANGAN TERDETEKSI {jarak_tangan:.1f} cm] Membuka Tutup Servo 180°...")
                move_servo_smooth(SUDUT_BUKA, sudut_sekarang)
                sudut_sekarang = SUDUT_BUKA
                is_buka = True
        else:
            # Jika tangan menjauh dan durasi buka telah selesai -> Tutup kembali
            if is_buka and time.ticks_diff(now_ms, t_terakhir_tangan) > int(DURASI_BUKA_DETIK * 1000):
                print("\n>>> [TANGAN MENJAUH] Menutup Tong 0°...")
                move_servo_smooth(SUDUT_TUTUP, sudut_sekarang)
                sudut_sekarang = SUDUT_TUTUP
                time.sleep_ms(200)
                release_servo()
                is_buka = False

                # Tunggu getaran mekanis penutupan tutup mereda
                time.sleep_ms(900)
                
                # Baca timbangan dengan filter perataan multi-sampel
                berat_bacaan = hx.get_stable_gram(FAKTOR_KALIBRASI, samples=8)
                
                # Cek jika ada sampah baru yang masuk (ambang stabil >= 1.5 gram)
                if berat_bacaan > (berat_sampah_tetap + 1.5):
                    sampah_masuk = berat_bacaan - berat_sampah_tetap
                    # Kunci berat sampah secara tetap (tidak akan turun atau goyang)
                    berat_sampah_tetap = round(berat_bacaan, 1)
                    total_berat_akumulasi = berat_sampah_tetap
                    print(f"*** [SAMPAH MASUK] +{sampah_masuk:.1f} g | Berat Tetap Tong: {berat_sampah_tetap:.1f} g ***")
                    
                    # Ukur ultrasonik volume & kolaborasikan kapasitas
                    d_vol = read_sonar_median(trig_vol, echo_vol, samples=3)
                    tinggi = max(0.0, round(jarak_dasar_tong - d_vol, 1)) if d_vol else 0.0
                    persen_kolab = hitung_kapasitas_kolaborasi(tinggi, jarak_dasar_tong, berat_sampah_tetap, d_vol)
                    
                    # Kirim trigger pencatatan laporan transaksi ke Web Dashboard
                    kirim_data_ke_web(berat_sampah_tetap, tinggi, d_vol, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolab, reset_weight=True)

        # 2. Cek Sampah Masuk Manual (Saat Tutup Tong Sedang Tertutup)
        if not is_buka and (now_sec - last_manual_check) >= 3.0:
            last_manual_check = now_sec
            bacaan_awal = hx.get_stable_gram(FAKTOR_KALIBRASI, samples=4)
            # Jika terdeteksi kenaikan berat >= 2.0 g
            if bacaan_awal > (berat_sampah_tetap + 2.0):
                # Konfirmasi ulang setelah 350ms untuk memastikan bukan sekadar senggolan meja
                time.sleep_ms(350)
                bacaan_konfirmasi = hx.get_stable_gram(FAKTOR_KALIBRASI, samples=6)
                if bacaan_konfirmasi > (berat_sampah_tetap + 1.8):
                    sampah_masuk = bacaan_konfirmasi - berat_sampah_tetap
                    # Kunci berat secara tetap
                    berat_sampah_tetap = round(bacaan_konfirmasi, 1)
                    total_berat_akumulasi = berat_sampah_tetap
                    print(f"*** [SAMPAH MANUAL] +{sampah_masuk:.1f} g | Berat Tetap Tong: {berat_sampah_tetap:.1f} g ***")
                    
                    d_vol = read_sonar_median(trig_vol, echo_vol, samples=3)
                    tinggi = max(0.0, round(jarak_dasar_tong - d_vol, 1)) if d_vol else 0.0
                    persen_kolab = hitung_kapasitas_kolaborasi(tinggi, jarak_dasar_tong, berat_sampah_tetap, d_vol)
                    kirim_data_ke_web(berat_sampah_tetap, tinggi, d_vol, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolab, reset_weight=True)

        # 3. Pembacaan Sensor Ultrasonik Volume Tong & Kolaborasi Kapasitas
        jarak_vol_live = read_sonar_median(trig_vol, echo_vol, samples=2) if not is_buka else None
        tinggi_sampah = 0.0
        if jarak_vol_live is not None and jarak_vol_live >= 3.5:
            tinggi_sampah = max(0.0, round(jarak_dasar_tong - jarak_vol_live, 1))

        # Kolaborasi sensor: Load Cell + Ultrasonik
        persen_kolaborasi = hitung_kapasitas_kolaborasi(tinggi_sampah, jarak_dasar_tong, berat_sampah_tetap, jarak_vol_live)
        status_tong = "🔴 PENUH" if persen_kolaborasi >= 80 else ("🟡 TERISI" if persen_kolaborasi > 0 else "🟢 KOSONG")

        # 4. Kirim Status Telemetri ke Web Dashboard secara Berkala
        if (now_sec - last_send_time) >= INTERVAL_KIRIM_DATA:
            tutup_str = "BUKA 180°" if is_buka else "TUTUP 0° "
            tangan_str = f"{jarak_tangan:4.1f} cm" if jarak_tangan is not None else " -- cm"
            vol_str = f"{jarak_vol_live:4.1f} cm" if jarak_vol_live is not None else " -- cm"
            
            # Print informatif lengkap: Menampilkan berat tetap yang terkunci stabil & kapasitas kolaborasi
            print(f"Sensor Tangan: {tangan_str} | Volume Tong: {vol_str} | Kapasitas: {persen_kolaborasi:2d}% [{status_tong}] | Berat Tetap: {berat_sampah_tetap:5.1f}g | Tutup: {tutup_str}")

            kirim_data_ke_web(berat_sampah_tetap, tinggi_sampah, jarak_vol_live, total_berat_akumulasi, jarak_dasar_tong, persen_kapasitas=persen_kolaborasi)
            last_send_time = now_sec
            gc.collect()

        # 5. Ambil Perintah Jarak Jauh dari Web Dashboard (Tare, Buka Tutup, dll.)
        if (now_sec - last_poll_time) >= INTERVAL_POLL_CMD:
            cek_perintah_dashboard()
            last_poll_time = now_sec

        # 6. Pemulihan Otomatis Koneksi Wi-Fi jika Sempat Terputus
        if not wifi.isconnected() and (now_sec - last_wifi_check) >= 15:
            last_wifi_check = now_sec
            try:
                wifi.connect(WIFI_SSID, WIFI_PASSWORD)
            except Exception:
                pass

        time.sleep_ms(60)

    except KeyboardInterrupt:
        print("\n[STOP] Program dihentikan pengguna.")
        release_servo()
        break
    except Exception as e:
        print("Error Siklus:", e)
        time.sleep_ms(300)
