import UltrasonicWidget from './UltrasonicWidget.jsx'
import PirWidget from './PirWidget.jsx'
import JoystickWidget from './JoystickWidget.jsx'
import Gy87Widget from './Gy87Widget.jsx'
import Mpr121Widget from './Mpr121Widget.jsx'

/**
 * Maps a widget id to its component + metadata. Adding a sensor widget later is a
 * one-line addition here plus a new widget file — no changes needed to Dashboard.jsx.
 * `keys` lists the sensor keys this widget's history depends on (used to clear the
 * right slice of history on "clear"). `hasHistory` is false only for widgets with no
 * time-series concept (MPR121 is a bitfield snapshot) — their clear-history control
 * is omitted rather than shown as a no-op. Visibility/expansion state is no longer
 * static here — it's lifted into App.jsx's widgetState (Phase 2 infrastructure).
 */
export const registry = [
  {
    id: 'ultrasonic',
    title: 'Ultrasonic (DIST)',
    accentColor: '#22d3ee',
    keys: ['DIST'],
    hasHistory: true,
    Component: UltrasonicWidget,
  },
  {
    id: 'pir',
    title: 'PIR Motion',
    accentColor: '#f97316',
    keys: ['PIR'],
    hasHistory: true,
    Component: PirWidget,
  },
  {
    id: 'joystick',
    title: 'Joystick (JOY)',
    accentColor: '#a78bfa',
    keys: ['JOY'],
    hasHistory: true,
    Component: JoystickWidget,
  },
  {
    id: 'gy87',
    title: 'GY-87 (Roll/Pitch/Yaw)',
    accentColor: '#34d399',
    keys: ['ROLL', 'PITCH', 'YAW'],
    hasHistory: true,
    Component: Gy87Widget,
  },
  {
    id: 'mpr121',
    title: 'MPR121 Touch',
    accentColor: '#2dd4bf',
    keys: ['TOUCH'],
    hasHistory: false,
    Component: Mpr121Widget,
  },
]
