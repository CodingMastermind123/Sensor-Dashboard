import UltrasonicWidget from './UltrasonicWidget.jsx'
import PirWidget from './PirWidget.jsx'
import JoystickWidget from './JoystickWidget.jsx'

/**
 * Maps a widget id to its component + metadata. Adding a sensor widget later is a
 * one-line addition here plus a new widget file — no changes needed to Dashboard.jsx.
 */
export const registry = [
  {
    id: 'ultrasonic',
    title: 'Ultrasonic (DIST)',
    accentColor: '#22d3ee',
    visible: true,
    Component: UltrasonicWidget,
  },
  {
    id: 'pir',
    title: 'PIR Motion',
    accentColor: '#f97316',
    visible: true,
    Component: PirWidget,
  },
  {
    id: 'joystick',
    title: 'Joystick (JOY)',
    accentColor: '#a78bfa',
    visible: true,
    Component: JoystickWidget,
  },
]
