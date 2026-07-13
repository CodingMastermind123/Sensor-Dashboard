import { useEffect, useMemo, useRef } from 'react'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#f97316'
const MAX_EVENTS = 10
const STRIP_WIDTH = 260
const STRIP_HEIGHT = 28
const STRIP_WINDOW_MS = 30000
const TICK_WIDTH = 2

/**
 * PIR is an on/off event source, not a continuous signal — no line chart (per spec).
 * Shows a live status pulse, a timestamped log of 0->1 motion-start events, and a rolling
 * EKG-strip-style view of the raw HIGH/LOW signal (every reading, not just transitions) so
 * patterns like periodic false-triggering vs. genuine one-off motion are visible at a glance.
 */
function PirWidget({ latestByKey, historyByKey }) {
  const active = latestByKey.PIR === 1
  const history = historyByKey.PIR ?? []
  const canvasRef = useRef(null)

  const events = useMemo(() => {
    const rising = []
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1].v === 0 && history[i].v === 1) rising.push(history[i].t)
    }
    return rising.slice(-MAX_EVENTS).reverse()
  }, [history])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT)

    const now = Date.now()
    for (const point of history) {
      const age = now - point.t
      if (age > STRIP_WINDOW_MS || age < 0) continue
      // Newest reading at the right edge, oldest at the left — scrolls like an EKG strip.
      const x = STRIP_WIDTH * (1 - age / STRIP_WINDOW_MS)
      ctx.fillStyle = point.v === 1 ? ACCENT : '#404040'
      ctx.fillRect(x, 0, TICK_WIDTH, STRIP_HEIGHT)
    }
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

      <div className="mb-3">
        <canvas
          ref={canvasRef}
          width={STRIP_WIDTH}
          height={STRIP_HEIGHT}
          className="rounded border border-neutral-800 bg-neutral-950"
        />
        <div className="mt-1 text-[10px] text-neutral-600">last 30s (raw signal)</div>
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
