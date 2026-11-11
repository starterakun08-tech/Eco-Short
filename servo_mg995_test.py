# servo_mg995_test.py
"""MicroPython script for ESP32 to control an MG995 servo.

The servo will:
  1. Start at 0° (closed).
  2. Move smoothly to 90° and hold for 4 seconds.
  3. Return to 0° and pause.
  4. Repeat indefinitely.

Connect the servo as follows:
  * Red  (VCC)  → ESP32 5V (VIN) **or** an external 5 V supply.
  * Black (GND) → any ESP32 GND (must share ground with the power source).
  * Yellow/Orange (Signal) → a free GPIO pin (default: 13).

A common external 5 V supply (e.g., a 5 V 2 A phone charger) is recommended.
"""

from machine import Pin, PWM
import time

# ----- Configuration -----
SERVO_PIN = 13          # Change if you use a different GPIO
FREQ = 50               # 50 Hz for standard hobby servos
MIN_PULSE_US = 1000      # Pulse width for ~0° (typical for MG995)
MAX_PULSE_US = 2000      # Pulse width for ~180° (typical for MG995)
TARGET_ANGLE = 90       # Desired angle in degrees
HOLD_TIME = 4           # Seconds to hold the position
# -------------------------

# Initialise PWM on the chosen pin
pwm = PWM(Pin(SERVO_PIN), freq=FREQ)

def angle_to_pulse_us(angle: int) -> int:
    """Convert an angle (0‑180) to pulse width in microseconds.
    Linear mapping between MIN_PULSE_US and MAX_PULSE_US.
    """
    if angle < 0:
        angle = 0
    if angle > 180:
        angle = 180
    # Linear interpolation
    pulse = MIN_PULSE_US + (MAX_PULSE_US - MIN_PULSE_US) * angle // 180
    return pulse

def set_servo_angle(angle: int):
    """Set the servo to *angle* degrees.
    The function writes the appropriate pulse width using duty_ns (nanoseconds).
    """
    us = angle_to_pulse_us(angle)
    # PWM duty_ns expects nanoseconds
    pwm.duty_ns(us * 1000)

def main():
    print("Starting MG995 test: 0° → 90° (hold) → 0°")
    # Ensure servo starts at 0°
    set_servo_angle(0)
    time.sleep(1)  # give it a moment to settle

    # Move to target angle
    print(f"Moving to {TARGET_ANGLE}°")
    set_servo_angle(TARGET_ANGLE)
    time.sleep(HOLD_TIME)

    # Return to 0°
    print("Returning to 0°")
    set_servo_angle(0)
    time.sleep(1)

    # Loop forever – you can stop the script with Ctrl‑C in Thonny
    while True:
        set_servo_angle(TARGET_ANGLE)
        time.sleep(HOLD_TIME)
        set_servo_angle(0)
        time.sleep(2)

if __name__ == "__main__":
    try:
        main()
    finally:
        # Clean up: turn off PWM to release the servo (optional)
        pwm.deinit()
        print("Servo test stopped.")
