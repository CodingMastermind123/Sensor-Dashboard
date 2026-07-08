import UltrasonicWidget from './UltrasonicWidget.jsx'

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
]
