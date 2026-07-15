import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#22d3ee'
const STALE_MS = 2000
// Fixed (not auto-scaled) chart range in cm. Auto-scaling to the full buffer let a single
// startup-settling outlier (e.g. an early ~375cm reading) blow out the axis and flatten every
// normal desk-range reading to the bottom. Adjust if the sensor is used at longer range.
// Recharts silently expands past an explicit domain array unless allowDataOverflow is also
// set on the <YAxis> — without it, an outlier still blows out the axis exactly as before.
const Y_DOMAIN = [0, 150]

function UltrasonicWidget({ latestByKey, historyByKey }) {
  // Re-renders periodically so staleness reflects frames that *stopped* arriving,
  // not just the last frame that did.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  const current = latestByKey.DIST
  const history = historyByKey.DIST ?? []
  const lastPoint = history[history.length - 1]
  const stale = lastPoint ? Date.now() - lastPoint.t > STALE_MS : true

  const values = history.map((p) => p.v)
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null

  return (
    <WidgetCard title="Ultrasonic (DIST)" accentColor={ACCENT}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className={`text-4xl font-bold tabular-nums ${stale ? 'text-neutral-600' : 'text-neutral-50'}`}>
          {current != null ? Number(current).toFixed(1) : '—'}
        </span>
        <span className="text-sm text-neutral-500">cm{stale && current != null ? ' (stale)' : ''}</span>
      </div>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <XAxis dataKey="t" hide />
            <YAxis domain={Y_DOMAIN} allowDataOverflow width={32} tick={{ fontSize: 10, fill: '#737373' }} />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #404040', fontSize: 12 }}
              labelFormatter={() => ''}
              formatter={(v) => [`${v} cm`, 'DIST']}
            />
            <Line type="monotone" dataKey="v" stroke={ACCENT} dot={false} isAnimationActive={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex justify-between text-xs text-neutral-500">
        <span>min: {min != null ? min.toFixed(1) : '—'}</span>
        <span>max: {max != null ? max.toFixed(1) : '—'}</span>
        <span>updated: {lastPoint ? new Date(lastPoint.t).toLocaleTimeString() : '—'}</span>
      </div>
    </WidgetCard>
  )
}

export default UltrasonicWidget
