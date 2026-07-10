import { useMemo } from 'react'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#f97316'
const MAX_EVENTS = 10

/**
 * PIR is an on/off event source, not a continuous signal — no line chart (per spec).
 * Shows a live status pulse plus a timestamped log of 0->1 motion-start events, derived
 * by diffing the bounded PIR history the socket hook already keeps.
 */
function PirWidget({ latestByKey, historyByKey }) {
  const active = latestByKey.PIR === 1
  const history = historyByKey.PIR ?? []

  const events = useMemo(() => {
    const rising = []
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1].v === 0 && history[i].v === 1) rising.push(history[i].t)
    }
    return rising.slice(-MAX_EVENTS).reverse()
  }, [history])

  return (
    <WidgetCard title="PIR Motion" accentColor={ACCENT}>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`h-4 w-4 rounded-full ${active ? 'bg-orange-500' : 'bg-neutral-700'}`}
          style={active ? { boxShadow: '0 0 12px 2px rgba(249, 115, 22, 0.7)' } : undefined}
          aria-hidden="true"
        />
        <span className="text-lg font-semibold text-neutral-100">
          {active ? 'Motion detected' : 'Idle'}
        </span>
      </div>

      <div className="text-xs text-neutral-500">
        <div className="mb-1 font-medium text-neutral-400">Recent events</div>
        {events.length === 0 ? (
          <div className="text-neutral-600">No motion events yet</div>
        ) : (
          <ul className="space-y-0.5">
            {events.map((t) => (
              <li key={t}>{new Date(t).toLocaleTimeString()}</li>
            ))}
          </ul>
        )}
      </div>
    </WidgetCard>
  )
}

export default PirWidget
