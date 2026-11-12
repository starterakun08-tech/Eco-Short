"""
MicroPython driver for HX711 24-bit ADC / Load Cell amplifier.
"""
try:
    from machine import Pin  # type: ignore
except ImportError:
    class Pin:
        IN = 0
        OUT = 1
        def __init__(self, *args, **kwargs): pass
        def value(self, *args, **kwargs): return 0

import time

if not hasattr(time, 'ticks_ms'):
    time.ticks_ms = lambda: int(time.time() * 1000)
if not hasattr(time, 'ticks_diff'):
    time.ticks_diff = lambda a, b: a - b
if not hasattr(time, 'sleep_ms'):
    time.sleep_ms = lambda ms: time.sleep(ms / 1000.0)

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
            time.sleep_ms(1)

        raw = 0
        for _ in range(24):
            self.pd_sck.value(1)
            raw = (raw << 1) | self.d_out.value()
            self.pd_sck.value(0)

        # 25th pulse for Gain 128 (Channel A)
        self.pd_sck.value(1)
        self.pd_sck.value(0)

        # 24-bit 2's complement
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
        self.offset = self.read_average(times)
        return self.offset

    def get_value(self):
        val = self.read()
        return (val - self.offset) if val is not None else None

