/*
 * Ultrasonic Distance Sensor - Phase 1 Pipeline
 * Board: Arduino Uno R4 (Renesas core - arduino:renesas_uno)
 * Sensor: HC-SR04
 *
 * Wiring:
 *   VCC  -> 5V
 *   GND  -> GND
 *   Trig -> A1
 *   Echo -> A2
 *
 * Serial: 115200 baud
 * Output format (one line per cycle): DIST:<float cm>,TS:<millis>
 * Example: DIST:23.4,TS:10234
 */


const int echoPin = A2;
const int trigPin = A1;
unsigned long lastMeasureTime = 0;
const unsigned long measureInterval = 60;


void setup() {
  // put your setup code here, to run once:
  pinMode(echoPin, INPUT);
  pinMode(trigPin, OUTPUT);

  Serial.begin(115200);



}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastMeasureTime >= measureInterval) {
    lastMeasureTime = currentTime;

    // Trigger the pulse
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // Measure the echo and convert to distance
    long duration = pulseIn(echoPin, HIGH, 30000);
    float distance = (duration * 0.034) / 2;

    // Only print if the reading is physically plausible
    if (distance > 2 && distance < 400) {
      Serial.print("DIST:");
      Serial.print(distance);
      Serial.print(",TS:");
      Serial.println(currentTime);
    }
  }
}
