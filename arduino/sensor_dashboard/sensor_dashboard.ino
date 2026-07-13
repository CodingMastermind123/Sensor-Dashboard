/*
 * Sensor Dashboard - Phase 1/2 Pipeline (Ultrasonic, PIR, Joystick)
 * Board: Arduino Uno R4 (Renesas core - arduino:renesas_uno)
 * Sensors: HC-SR04 (ultrasonic), PIR motion module, 2-axis analog joystick
 *
 * Wiring:
 *   HC-SR04 VCC -> 5V
 *   HC-SR04 GND -> GND
 *   HC-SR04 Trig -> 3
 *   HC-SR04 Echo -> 4
 *   PIR VCC -> 5V
 *   PIR GND -> GND
 *   PIR OUT -> 2
 *   Joystick VCC -> 5V
 *   Joystick GND -> GND
 *   Joystick VRx -> A1
 *   Joystick VRy -> A0
 *
 * Serial: 115200 baud
 * Output format (one line per cycle): [DIST:<float cm>,]PIR:<0|1>,TS:<millis>,JOY:<x>:<y>
 *   (DIST is omitted, not zeroed, when the ultrasonic reading is out of the 2-400cm range)
 * Example: DIST:23.4,PIR:0,TS:10234,JOY:512:489
 * Example (DIST out of range): PIR:0,TS:10234,JOY:512:489
 */

const int echoPin = 4;
const int trigPin = 3;
const int pirPin = 2;
const int vrX = A1;
const int vrY = A0;
unsigned long lastMeasureTime = 0;
const unsigned long measureInterval = 60;


void setup() {
  // put your setup code here, to run once:
  pinMode(echoPin, INPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(pirPin, INPUT);

  Serial.begin(115200);



}

void loop() {
  unsigned long currentTime = millis();
  int joyX = analogRead(vrX);
  int joyY = analogRead(vrY);

  if (currentTime - lastMeasureTime >= measureInterval) {
    lastMeasureTime = currentTime;

    String line = "";

    // Trigger and measure ultrasonic
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 30000);
    float distance = (duration * 0.034) / 2;

    // Only append DIST if the reading is valid
    if (distance > 2 && distance < 400) {
      line += "DIST:";
      line += distance;
    }

    // PIR always gets read and always gets appended
    int motionDetected = digitalRead(pirPin);
    if (line.length() > 0) line += ",";
    line += "PIR:";
    line += motionDetected;

    // Timestamp always included
    line += ",TS:";
    line += currentTime;

    line += ",JOY:";
    line += joyX;
    line += ":";
    line += joyY;

    Serial.println(line);
  }
}