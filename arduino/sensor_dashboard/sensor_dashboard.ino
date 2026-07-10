/*
 * Ultrasonic Distance Sensor - Phase 1 Pipeline
 * Board: Arduino Uno R4 (Renesas core - arduino:renesas_uno)
 * Sensor: HC-SR04
 *
 * Wiring:
 *   VCC  -> 5V
 *   GND  -> GND
 *   Trig -> 3
 *   Echo -> 4
 *   PIR -> 2
 *
 * Serial: 115200 baud
 * Output format (one line per cycle): DIST:<float cm>,TS:<millis>
 * Example: DIST:23.4,TS:10234
 */


const int echoPin = 4;
const int trigPin = 3;
const int pirPin = 2;
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

    Serial.println(line);
  }
}