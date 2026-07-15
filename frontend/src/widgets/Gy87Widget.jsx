import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#34d399'
const COLORS = { roll: '#f472b6', pitch: '#60a5fa', yaw: '#facc15' }
const TILT_DOMAIN = [-45, 45]

/**
 * Roll/pitch/yaw share one chart but not one Y-axis: yaw's full 0-360deg heading range
 * would otherwise dwarf roll/pitch's +-30deg tilt range and flatten them to a line near
 * the bottom. Yaw gets its own fixed 0-360 axis (right); roll/pitch share a tighter
 * +-45deg axis (left) since they're on comparable scales to each other.
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
            <YAxis
              yAxisId="tilt"
              domain={TILT_DOMAIN}
              allowDataOverflow
              width={36}
              tick={{ fontSize: 10, fill: COLORS.roll }}
            />
            <YAxis
              yAxisId="yaw"
              orientation="right"
              domain={[0, 360]}
              allowDataOverflow
              width={36}
              tick={{ fontSize: 10, fill: COLORS.yaw }}
            />
            <Tooltip
              contentStyle={{ background: '#171717', border: '1px solid #404040', fontSize: 12 }}
              labelFormatter={() => ''}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="tilt" type="monotone" dataKey="roll" name="Roll" stroke={COLORS.roll} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line yAxisId="tilt" type="monotone" dataKey="pitch" name="Pitch" stroke={COLORS.pitch} dot={false} isAnimationActive={false} strokeWidth={2} />
            <Line yAxisId="yaw" type="monotone" dataKey="yaw" name="Yaw" stroke={COLORS.yaw} dot={false} isAnimationActive={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  )
}

export default Gy87Widget
