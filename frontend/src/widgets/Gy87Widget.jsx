import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#34d399'
const COLORS = { roll: '#f472b6', pitch: '#60a5fa', yaw: '#facc15' }

/**
 * Roll/pitch/yaw share one chart on a common (auto-scaled) axis. Yaw's full 0-360deg
 * heading range will typically dwarf roll/pitch's +-30deg tilt range visually — a known
 * tradeoff for keeping this a single combined 3-channel graph rather than dual axes.
 */
function Gy87Widget({ latestByKey, historyByKey }) {
  const rollHist = historyByKey.ROLL ?? []
  const pitchHist = historyByKey.PITCH ?? []
  const yawHist = historyByKey.YAW ?? []
  const len = Math.min(rollHist.length, pitchHist.length, yawHist.length)

  const data = []
  for (let i = 0; i < len; i++) {
    const roll = rollHist[rollHist.length - len + i]
    const pitch = pitchHist[pitchHist.length - len + i]
    const yaw = yawHist[yawHist.length - len + i]
    data.push({ t: roll.t, roll: roll.v, pitch: pitch.v, yaw: yaw.v })
  }

  const roll = latestByKey.ROLL
  const pitch = latestByKey.PITCH
  const yaw = latestByKey.YAW

  return (
    <WidgetCard title="GY-87 (Roll/Pitch/Yaw)" accentColor={ACCENT}>
      <div className="mb-2 flex gap-4 text-sm">
        <span style={{ color: COLORS.roll }}>roll: {roll != null ? roll.toFixed(1) : '—'}°</span>
        <span style={{ color: COLORS.pitch }}>pitch: {pitch != null ? pitch.toFixed(1) : '—'}°</span>
        <span style={{ color: COLORS.yaw }}>yaw: {yaw != null ? yaw.toFixed(1) : '—'}°</span>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="t" hide />
            <YAxis width={36} tick={{ fontSize: 10, fill: '#737373' }} />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #404040', fontSize: 12 }}
              labelFormatter={() => ''}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="roll" name="Roll" stroke={COLORS.roll} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line type="monotone" dataKey="pitch" name="Pitch" stroke={COLORS.pitch} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line type="monotone" dataKey="yaw" name="Yaw" stroke={COLORS.yaw} dot={false} isAnimationActive={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  )
}

export default Gy87Widget
