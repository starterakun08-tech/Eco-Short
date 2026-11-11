"""
====================================================================
  PROGRAM UJI COBA SENSOR BERAT LOAD CELL + MODUL HX711 (ESP32)
====================================================================
Pin ESP32:
  - DT  (Data Out)   --> GPIO 4 (Pin D4)
  - SCK (Power Clock)--> GPIO 5 (Pin D5)
  - VCC              --> Pin 3V3 (atau 5V/VIN) ESP32
  - GND              --> Pin GND ESP32

Koneksi Load Cell (4 Kabel) ke Modul HX711:
  - Kabel MERAH  --> E+ (Excitation +)
  - Kabel HITAM  --> E- (Excitation -)
  - Kabel PUTIH  --> A- (Signal -)
  - Kabel HIJAU  --> A+ (Signal +)
====================================================================
"""
from machine import Pin
import time

DT_PIN  = 4  # GPIO 4 (D4)
SCK_PIN = 5  # GPIO 5 (D5)

# Driver HX711 Mandiri (Bisa langsung jalan tanpa install library luar)
class HX711:
    def __init__(self, d_out, pd_sck):
        self.d_out = Pin(d_out, Pin.IN)
        self.pd_sck = Pin(pd_sck, Pin.OUT)
        self.pd_sck.value(0)
        self.offset = 0

    def is_ready(self):
        return self.d_out.value() == 0

    def read(self):
        # Tunggu sensor siap (timeout 500ms)
        start = time.ticks_ms()
        while not self.is_ready():
            if time.ticks_diff(time.ticks_ms(), start) > 500:
                return None

        raw = 0
        for _ in range(24):
            self.pd_sck.value(1)
            raw = (raw << 1) | self.d_out.value()
            self.pd_sck.value(0)

        # Pulsa ke-25 untuk set Gain 128 (Channel A)
        self.pd_sck.value(1)
        self.pd_sck.value(0)

        # Konversi 24-bit complement ke signed integer
        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def read_average(self, times=10):
        total = 0
        valid = 0
        for _ in range(times):
            val = self.read()
            if val is not None:
                total += val
                valid += 1
            time.sleep_ms(5)
        return int(total / valid) if valid > 0 else 0

    def tare(self, times=15):
        print("Sedang kalibrasi titik nol (Tare)... Jangan sentuh load cell!")
        self.offset = self.read_average(times)
        print("Tare selesai! Titik nol:", self.offset)

    def get_value(self):
        val = self.read()
        return (val - self.offset) if val is not None else None

# Inisialisasi HX711
hx = HX711(d_out=DT_PIN, pd_sck=SCK_PIN)

print("=" * 55)
print("  TES SENSOR LOAD CELL + HX711")
print("=" * 55)
print("DT  Pin : GPIO", DT_PIN)
print("SCK Pin : GPIO", SCK_PIN)
print("-" * 55)

time.sleep(1)
hx.tare()
print("\nSiap membaca berat! Tekan load cell atau letakkan benda...\n")

# Faktor kalibrasi awal (bisa disesuaikan setelah dites dengan beban yang diketahui)
FAKTOR_KALIBRASI = 423.5

try:
    while True:
        val = hx.get_value()
        if val is not None:
            gram = val / FAKTOR_KALIBRASI
            if abs(gram) < 2:  # Abaikan noise getaran kecil
                gram = 0.0
            print("Raw: {:8d} | Berat: {:6.1f} gram".format(val, gram))
        else:
            print("Sensor tidak terbaca / timeout! Cek kabel DT & SCK.")
        
        time.sleep_ms(250)

except KeyboardInterrupt:
    print("\nProgram dihentikan.")

