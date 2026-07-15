import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#2dd4bf'
const PAD_COUNT = 12

/**
 * 12-pad grid, one cell per electrode. Index = pad (pad 0 is the first character of the
 * TOUCH bitfield) — this mapping is a placeholder assumption; verify actual electrode
 * numbering against real hardware once the MPR121 is wired up.
 */
function Mpr121Widget({ latestByKey }) {
  const touch = latestByKey.TOUCH ?? '0'.repeat(PAD_COUNT)
  const pads = touch.split('').map((c) => c === '1')

  return (
    <WidgetCard title="MPR121 Touch" accentColor={ACCENT}>
      <div className="grid grid-cols-4 gap-2">
        {pads.map((active, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded text-xs font-medium transition-colors ${
              active ? 'bg-teal-500 text-neutral-950' : 'bg-neutral-800 text-neutral-500'
            }`}
          >
            {i}
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-neutral-500">raw: {touch}</div>
    </WidgetCard>
  )
}

export default Mpr121Widget
