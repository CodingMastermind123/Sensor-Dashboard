/*
 * Sensor Dashboard - Phase 2 (Ultrasonic + PIR + Joystick + IMU roll/pitch + Yaw)
 * Board: Arduino Uno R4 (Renesas core - arduino:renesas_uno)
 * Sensors: HC-SR04, PIR (HC-SR501 style), Joystick module, GY-87 (MPU6050 + QMC5883L)
 *
 * Wiring:
 *   HC-SR04   VCC->5V  GND->GND  Trig->3   Echo->4
 *   PIR       VCC->5V  GND->GND  OUT->2
 *   Joystick  VCC->5V  GND->GND  VRx->A0   VRy->A1
 *   GY-87     VCC->5V  GND->GND  SDA->SDA  SCL->SCL
 *             MPU6050 (accel/gyro) at 0x68
 *             QMC5883L (magnetometer, NOT genuine HMC5883L) at 0x0D,
 *               reachable only after enabling MPU6050 bypass mode
 *
 * Serial: 115200 baud
 * Output format (one line per cycle):
 *   DIST:<float cm>,PIR:<0/1>,JOY:<x>:<y>,ROLL:<float deg>,PITCH:<float deg>,
 *   YAW:<float deg>,TS:<millis>
 *   (DIST omitted on cycles where the ultrasonic reading is out of range)
 *
 * IMPORTANT: YAW is currently raw magnetometer heading, calibrated with a
 * fixed offset, but NOT tilt-compensated. It is only accurate when the
 * board is level. Tilt compensation (using ROLL/PITCH to correct the
 * magnetometer reading at non-flat orientations) is not yet implemented.
 */

#include <Wire.h>

// --- Pin declarations ---
const int echoPin = 4;
const int trigPin = 3;
const int pirPin = 2;
const int joyXPin = A0;
const int joyYPin = A1;

// --- Timing ---
unsigned long lastMeasureTime = 0;
const unsigned long measureInterval = 60; // ms

// --- IMU (MPU6050: accel + gyro) ---
const int MPU_ADDR = 0x68;
unsigned long lastIMUTime = 0;
float rollAngle = 0;
float pitchAngle = 0;

const float GYRO_SENSITIVITY = 131.0;    // LSB per deg/s, default +-250 deg/s range
const float ACCEL_SENSITIVITY = 16384.0; // LSB per g, default +-2g range (unused directly)
const float ALPHA = 0.98;

// --- Magnetometer (QMC5883L, via MPU6050 bypass) ---
const int QMC_ADDR = 0x0D;
const float HEADING_OFFSET = 193.0; // calibrated against magnetic north

void setup() {
  pinMode(echoPin, INPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(pirPin, INPUT);

  Wire.begin();
  Serial.begin(115200);

  // --- Wake the MPU6050 (defaults to sleep mode on power-up) ---
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1
  Wire.write(0);
  Wire.endTransmission(true);

  // --- Disable MPU6050's own aux-bus mastering, so it doesn't fight bypass mode ---
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6A); // USER_CTRL
  Wire.write(0x00);
  Wire.endTransmission(true);

  // --- Enable bypass so the Arduino can talk directly to the magnetometer ---
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x37); // INT_PIN_CFG
  Wire.write(0x02); // I2C_BYPASS_EN
  Wire.endTransmission(true);

  // --- Init QMC5883L ---
  Wire.beginTransmission(QMC_ADDR);
  Wire.write(0x0B); // Set/Reset period register
  Wire.write(0x01);
  Wire.endTransmission();

  Wire.beginTransmission(QMC_ADDR);
  Wire.write(0x09); // Control register 1
  Wire.write(0x1D); // continuous mode, 200Hz, 8-gauss, 512 oversampling
  Wire.endTransmission();

  lastIMUTime = millis();
}

void loop() {
  unsigned long currentTime = millis();
  int joyX = analogRead(joyXPin);
  int joyY = analogRead(joyYPin);

  if (currentTime - lastMeasureTime >= measureInterval) {
    lastMeasureTime = currentTime;

    String line = "";

    // --- Ultrasonic ---
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 30000);
    float distance = (duration * 0.034) / 2;

    if (distance > 2 && distance < 400) {
      line += "DIST:";
      line += distance;
    }

    // --- PIR (always reads and appends, independent of DIST validity) ---
    int motionDetected = digitalRead(pirPin);
    if (line.length() > 0) line += ",";
    line += "PIR:";
    line += motionDetected;

    // --- Joystick ---
    line += ",JOY:";
    line += joyX;
    line += ":";
    line += joyY;

    // --- IMU: read raw accel/gyro over I2C ---
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B); // ACCEL_XOUT_H
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 14, true);

    int16_t accelX = Wire.read() << 8 | Wire.read();
    int16_t accelY = Wire.read() << 8 | Wire.read();
    int16_t accelZ = Wire.read() << 8 | Wire.read();
    int16_t temp   = Wire.read() << 8 | Wire.read(); // unused, must be read to stay register-aligned
    int16_t gyroX  = Wire.read() << 8 | Wire.read();
    int16_t gyroY  = Wire.read() << 8 | Wire.read();
    int16_t gyroZ  = Wire.read() << 8 | Wire.read();

    // --- Complementary filter: blend gyro (smooth, drifts) with accel (noisy, stable) ---
    unsigned long nowIMU = millis();
    float dt = (nowIMU - lastIMUTime) / 1000.0;
    lastIMUTime = nowIMU;

    float gyroXrate = gyroX / GYRO_SENSITIVITY;
    float gyroYrate = gyroY / GYRO_SENSITIVITY;

    float accelRoll  = atan2(accelY, accelZ) * 180.0 / PI;
    float accelPitch = atan2(-accelX, sqrt((float)accelY * accelY + (float)accelZ * accelZ)) * 180.0 / PI;

    rollAngle  = ALPHA * (rollAngle + gyroXrate * dt) + (1 - ALPHA) * accelRoll;
    pitchAngle = ALPHA * (pitchAngle + gyroYrate * dt) + (1 - ALPHA) * accelPitch;

    line += ",ROLL:";
    line += rollAngle;
    line += ",PITCH:";
    line += pitchAngle;

    // --- Magnetometer: raw heading (level-only, NOT tilt-compensated) ---
    Wire.beginTransmission(QMC_ADDR);
    Wire.write(0x00); // first data register
    Wire.endTransmission(false);
    Wire.requestFrom(QMC_ADDR, 6, true);

    int16_t magX = Wire.read() | Wire.read() << 8; // LSB first on this chip
    int16_t magY = Wire.read() | Wire.read() << 8;
    int16_t magZ = Wire.read() | Wire.read() << 8;

    float heading = atan2(magY, magX) * 180.0 / PI;
    heading -= HEADING_OFFSET;
    while (heading < 0) heading += 360;
    while (heading >= 360) heading -= 360;

    line += ",YAW:";
    line += heading;

    line += ",TS:";
    line += currentTime;

    Serial.println(line);
  }
}