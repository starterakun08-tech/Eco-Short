"""
============================================================
  DIAGNOSTIK LENGKAP RCWL-9616 (SEMUA MODE)
============================================================
INSTRUKSI SEBELUM RUN:
1. CABUT kabel VCC sensor dari ESP32
2. Tunggu 5 detik
3. Pasang kembali VCC ke pin VIN (5V) ESP32
4. Baru RUN script ini
"""
from machine import Pin, time_pulse_us
import time

print("=" * 55)
print("  DIAGNOSTIK LENGKAP RCWL-9616")
print("=" * 55)
print("Pastikan VCC sensor di VIN (5V), GND di GND ESP32")
print("-" * 55)

# ============================================
# STEP 0: Cek level pin sebelum apa-apa
# ============================================
print("\n[STEP 0] Level pin saat ini:")
p19 = Pin(19, Pin.IN)
p21 = Pin(21, Pin.IN)
print("  GPIO 19 (Trig): {}".format(p19.value()))
print("  GPIO 21 (Echo): {}".format(p21.value()))
time.sleep_ms(500)

# ============================================
# STEP 1: GPIO standar (Trig=19, Echo=21) TANPA pull-down
# ============================================
print("\n[STEP 1] GPIO Standar: Trig=19, Echo=21 (tanpa pull)")
trig = Pin(19, Pin.OUT)
echo = Pin(21, Pin.IN)

for i in range(5):
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    
    try:
        dur = time_pulse_us(echo, 1, 50000)
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            print("  [{}] {} us = {:.1f} cm".format(i+1, dur, cm))
        else:
            print("  [{}] Timeout ({})".format(i+1, dur))
    except Exception as e:
        print("  [{}] Error: {}".format(i+1, e))
    time.sleep_ms(100)

# ============================================
# STEP 2: GPIO standar DENGAN pull-down
# ============================================
print("\n[STEP 2] GPIO Standar: Trig=19, Echo=21 (PULL_DOWN)")
trig = Pin(19, Pin.OUT)
echo = Pin(21, Pin.IN, Pin.PULL_DOWN)

for i in range(5):
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    
    try:
        dur = time_pulse_us(echo, 1, 50000)
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            print("  [{}] {} us = {:.1f} cm".format(i+1, dur, cm))
        else:
            print("  [{}] Timeout ({})".format(i+1, dur))
    except Exception as e:
        print("  [{}] Error: {}".format(i+1, e))
    time.sleep_ms(100)

# ============================================
# STEP 3: GPIO terbalik (Trig=21, Echo=19)
# ============================================
print("\n[STEP 3] GPIO Terbalik: Trig=21, Echo=19")
trig2 = Pin(21, Pin.OUT)
echo2 = Pin(19, Pin.IN)

for i in range(5):
    trig2.value(0)
    time.sleep_us(5)
    trig2.value(1)
    time.sleep_us(10)
    trig2.value(0)
    
    try:
        dur = time_pulse_us(echo2, 1, 50000)
        if dur > 0:
            cm = (dur / 2.0) / 29.1
            print("  [{}] {} us = {:.1f} cm".format(i+1, dur, cm))
        else:
            print("  [{}] Timeout ({})".format(i+1, dur))
    except Exception as e:
        print("  [{}] Error: {}".format(i+1, e))
    time.sleep_ms(100)

# ============================================
# STEP 4: Cek aktivitas pin setelah trigger
# Ini monitor apakah Echo pin berubah SAMA SEKALI
# ============================================
print("\n[STEP 4] Monitor aktivitas Echo (GPIO 21) selama 500ms")
trig = Pin(19, Pin.OUT)
echo = Pin(21, Pin.IN)

# Kirim trigger
trig.value(0)
time.sleep_us(5)
trig.value(1)
time.sleep_us(10)
trig.value(0)

# Monitor pin selama 500ms
changes = 0
last_val = echo.value()
start = time.ticks_ms()
sample_count = 0
high_count = 0
low_count = 0

while time.ticks_diff(time.ticks_ms(), start) < 500:
    v = echo.value()
    sample_count += 1
    if v == 1:
        high_count += 1
    else:
        low_count += 1
    if v != last_val:
        changes += 1
        last_val = v

print("  Total sampel: {}".format(sample_count))
print("  HIGH: {}, LOW: {}".format(high_count, low_count))
print("  Perubahan level: {}".format(changes))
if changes == 0:
    val = echo.value()
    print("  >>> Pin DIAM di {} (tidak ada aktivitas)".format(val))
elif changes < 5:
    print("  >>> Ada sedikit aktivitas ({} perubahan)".format(changes))
else:
    print("  >>> Pin AKTIF! ({} perubahan)".format(changes))

# ============================================
# STEP 5: Monitor GPIO 19 (Trig) setelah trigger di 21
# ============================================
print("\n[STEP 5] Monitor Trig (GPIO 19) setelah trigger di Echo (21)")
trig2 = Pin(21, Pin.OUT)
mon = Pin(19, Pin.IN)

trig2.value(0)
time.sleep_us(5)
trig2.value(1)
time.sleep_us(10)
trig2.value(0)

changes = 0
last_val = mon.value()
start = time.ticks_ms()
sample_count = 0
high_count = 0
low_count = 0

while time.ticks_diff(time.ticks_ms(), start) < 500:
    v = mon.value()
    sample_count += 1
    if v == 1:
        high_count += 1
    else:
        low_count += 1
    if v != last_val:
        changes += 1
        last_val = v

print("  Total sampel: {}".format(sample_count))
print("  HIGH: {}, LOW: {}".format(high_count, low_count))
print("  Perubahan level: {}".format(changes))
if changes == 0:
    print("  >>> Pin DIAM di {}".format(mon.value()))
else:
    print("  >>> Pin AKTIF! ({} perubahan)".format(changes))

# ============================================
# STEP 6: 1-WIRE kedua pin
# ============================================
print("\n[STEP 6a] 1-WIRE GPIO 21")
p = Pin(21, Pin.OUT)
p.value(0)
time.sleep_us(5)
p.value(1)
time.sleep_us(10)
p.value(0)
time.sleep_us(20)
p = Pin(21, Pin.IN)
time.sleep_us(50)

start = time.ticks_us()
timeout = False
while p.value() == 0:
    if time.ticks_diff(time.ticks_us(), start) > 30000:
        timeout = True
        break

if not timeout:
    t1 = time.ticks_us()
    while p.value() == 1:
        if time.ticks_diff(time.ticks_us(), t1) > 30000:
            timeout = True
            break
    t2 = time.ticks_us()
    if not timeout:
        dur = time.ticks_diff(t2, t1)
        cm = (dur / 2.0) / 29.1
        print("  Durasi: {} us = {:.1f} cm".format(dur, cm))
    else:
        print("  Echo tetap HIGH (timeout)")
else:
    print("  Tidak ada echo (pin tetap LOW)")

print("\n[STEP 6b] 1-WIRE GPIO 19")
p = Pin(19, Pin.OUT)
p.value(0)
time.sleep_us(5)
p.value(1)
time.sleep_us(10)
p.value(0)
time.sleep_us(20)
p = Pin(19, Pin.IN)
time.sleep_us(50)

start = time.ticks_us()
timeout = False
while p.value() == 0:
    if time.ticks_diff(time.ticks_us(), start) > 30000:
        timeout = True
        break

if not timeout:
    t1 = time.ticks_us()
    while p.value() == 1:
        if time.ticks_diff(time.ticks_us(), t1) > 30000:
            timeout = True
            break
    t2 = time.ticks_us()
    if not timeout:
        dur = time.ticks_diff(t2, t1)
        cm = (dur / 2.0) / 29.1
        print("  Durasi: {} us = {:.1f} cm".format(dur, cm))
    else:
        print("  Echo tetap HIGH (timeout)")
else:
    print("  Tidak ada echo (pin tetap LOW)")

# ============================================
# STEP 7: Cek level pin terakhir
# ============================================
print("\n[STEP 7] Level pin akhir:")
p19 = Pin(19, Pin.IN)
p21 = Pin(21, Pin.IN)
print("  GPIO 19: {}".format(p19.value()))
print("  GPIO 21: {}".format(p21.value()))

print("\n" + "=" * 55)
print("  SELESAI - Kirim SEMUA hasil ke chat!")
print("=" * 55)
