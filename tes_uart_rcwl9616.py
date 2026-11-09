"""
============================================================
  TES UART SENSOR RCWL-9616 / HC-SR04-RC
============================================================
Sensor dalam mode UART (M1=1, M2=0).
Protokol RCWL-9616 UART: 4 byte per frame
  Byte 0: 0xFF (header)
  Byte 1: Jarak_High
  Byte 2: Jarak_Low
  Byte 3: Checksum = (0xFF + High + Low) & 0xFF
  Jarak (mm) = (High << 8) | Low

Pin: TX sensor = GPIO 19 (Trig) -> RX ESP32
     RX sensor = GPIO 21 (Echo) -> TX ESP32
     (Sensor auto-transmit, tidak perlu kirim perintah)
"""
from machine import UART, Pin
import time

# Pin sensor: Trig=GPIO19 (TX sensor), Echo=GPIO21 (RX sensor)
# ESP32 UART: rx = pin yang MENERIMA data = GPIO 19 (TX sensor)
#             tx = pin yang MENGIRIM data = GPIO 21 (RX sensor)

BAUD_RATES = [9600, 19200, 38400, 57600, 115200]

def cari_frame_0xff(data):
    """Cari frame valid 0xFF di dalam data bytes."""
    frames = []
    i = 0
    while i < len(data) - 3:
        if data[i] == 0xFF:
            high = data[i+1]
            low = data[i+2]
            checksum = data[i+3]
            calc_checksum = (0xFF + high + low) & 0xFF
            jarak_mm = (high << 8) | low
            valid = (checksum == calc_checksum)
            frames.append({
                'pos': i,
                'high': high,
                'low': low,
                'checksum': checksum,
                'calc_checksum': calc_checksum,
                'valid': valid,
                'jarak_mm': jarak_mm,
                'jarak_cm': jarak_mm / 10.0
            })
            i += 4  # Lompat ke frame berikutnya
        else:
            i += 1
    return frames


def tes_baud(baud):
    """Tes satu baud rate, return jumlah frame valid."""
    print(f"\n--- Tes Baud Rate: {baud} ---")
    
    try:
        uart = UART(1, baudrate=baud, rx=19, tx=21, timeout=500)
    except Exception as e:
        print(f"  Gagal init UART: {e}")
        return 0
    
    time.sleep_ms(200)
    
    # Buang data lama
    uart.read()
    time.sleep_ms(100)
    
    total_valid = 0
    total_invalid = 0
    jarak_list = []
    
    for ronde in range(5):
        time.sleep_ms(100)
        data = uart.read()
        
        if data is None or len(data) == 0:
            print(f"  [{ronde+1}] Tidak ada data diterima")
            continue
        
        print(f"  [{ronde+1}] Diterima {len(data)} byte")
        
        frames = cari_frame_0xff(data)
        
        if frames:
            for f in frames:
                status = "OK" if f['valid'] else "CHECKSUM SALAH"
                print(f"       Frame @{f['pos']}: Jarak={f['jarak_cm']:.1f} cm "
                      f"(0xFF,0x{f['high']:02X},0x{f['low']:02X},0x{f['checksum']:02X}) [{status}]")
                if f['valid']:
                    total_valid += 1
                    jarak_list.append(f['jarak_cm'])
                else:
                    total_invalid += 1
        else:
            # Tampilkan beberapa byte pertama untuk debug
            preview = ' '.join(f'0x{b:02X}' for b in data[:20])
            print(f"       Tidak ada frame 0xFF ditemukan. Data: {preview}...")
    
    uart.deinit()
    
    print(f"\n  HASIL Baud {baud}: {total_valid} frame valid, {total_invalid} checksum salah")
    if jarak_list:
        avg = sum(jarak_list) / len(jarak_list)
        print(f"  Rata-rata jarak: {avg:.1f} cm (min={min(jarak_list):.1f}, max={max(jarak_list):.1f})")
    
    return total_valid


print("=" * 60)
print("  TES UART SENSOR RCWL-9616 / HC-SR04-RC")
print("=" * 60)
print("Pin: RX ESP32 = GPIO 19 (TX sensor / Trig)")
print("     TX ESP32 = GPIO 21 (RX sensor / Echo)")
print("Dekatkan tangan 10-30 cm lalu jauhkan selama tes.")
print("-" * 60)

hasil = {}
for baud in BAUD_RATES:
    valid = tes_baud(baud)
    hasil[baud] = valid
    if valid >= 3:
        print(f"\n>>> BAUD RATE {baud} BERHASIL! <<<")
        
        # Tes pembacaan jarak real-time
        print(f"\n--- Pembacaan Real-Time (Baud {baud}) ---")
        print("Dekatkan / jauhkan tangan dari sensor...")
        uart = UART(1, baudrate=baud, rx=19, tx=21, timeout=300)
        time.sleep_ms(200)
        uart.read()  # Buang data lama
        
        for i in range(20):
            time.sleep_ms(200)
            data = uart.read()
            if data:
                frames = cari_frame_0xff(data)
                valid_frames = [f for f in frames if f['valid']]
                if valid_frames:
                    last = valid_frames[-1]
                    bar = "#" * min(50, int(last['jarak_cm'] / 2))
                    print(f"  [{i+1:2d}] Jarak: {last['jarak_cm']:6.1f} cm |{bar}")
                else:
                    print(f"  [{i+1:2d}] Frame tidak valid")
            else:
                print(f"  [{i+1:2d}] Tidak ada data")
        
        uart.deinit()
        break

print("\n" + "=" * 60)
print("  RINGKASAN HASIL")
print("=" * 60)
for baud, valid in hasil.items():
    status = "COCOK!" if valid >= 3 else ("Mungkin" if valid >= 1 else "Tidak cocok")
    print(f"  Baud {baud:6d}: {valid:2d} frame valid [{status}]")

best = max(hasil, key=hasil.get)
if hasil[best] > 0:
    print(f"\n>>> Baud rate terbaik: {best}")
    print(">>> Sensor RCWL-9616 BERFUNGSI dalam mode UART!")
    print(">>> Selanjutnya update codeesp.py untuk pakai UART.")
else:
    print("\n>>> Tidak ada baud rate yang cocok.")
    print(">>> Kemungkinan:")
    print("    1. Kabel Trig/Echo terbalik (coba tukar)")
    print("    2. Sensor dalam mode 1-WIRE (M1=1, M2=1)")
    print("    3. Tegangan VCC kurang (harus 5V, bukan 3.3V)")

print("=" * 60)

