import { useEffect, useRef } from 'react'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#a78bfa'
const ACCENT_RGB = '167, 139, 250'
const SIZE = 180
const RANGE_MAX = 1023
const LERP = 0.25
const TRAIL_LENGTH = 20
const TRAIL_MAX_ALPHA = 0.5

/**
 * 2D canvas dot tracking the joystick's raw {x,y} (0-1023 analog range) in real time.
 * Draws via requestAnimationFrame so motion stays smooth independent of React's render
 * cadence — the rAF loop reads the latest target from a ref rather than re-rendering.
 */
function JoystickWidget({ latestByKey }) {
  const canvasRef = useRef(null)
  const targetRef = useRef({ x: RANGE_MAX / 2, y: RANGE_MAX / 2 })
  const posRef = useRef({ x: RANGE_MAX / 2, y: RANGE_MAX / 2 })
  // Raw (unsmoothed) recent readings, oldest first — makes jitter/noise around center
  // visible as a small spread rather than a single static-looking dot.
  const trailRef = useRef([])

  useEffect(() => {
    const joy = latestByKey.JOY
    if (joy && typeof joy.x === 'number' && typeof joy.y === 'number') {
      targetRef.current = joy
      trailRef.current = [...trailRef.current, joy].slice(-TRAIL_LENGTH)
    }
  }, [latestByKey.JOY])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    function toCanvas(x, y) {
      return {
        cx: (x / RANGE_MAX) * SIZE,
        // Direct mapping, no inversion — matches this joystick module's Y-axis wiring
        // (raw value increases toward physical "down"). If a different module wires
        // it the other way, flip this back to `SIZE - (y / RANGE_MAX) * SIZE`.
        cy: (y / RANGE_MAX) * SIZE,
      }
    }

    function draw() {
      const pos = posRef.current
      const target = targetRef.current
      pos.x += (target.x - pos.x) * LERP
      pos.y += (target.y - pos.y) * LERP

      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.strokeStyle = '#404040'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(SIZE / 2, 0)
      ctx.lineTo(SIZE / 2, SIZE)
      ctx.moveTo(0, SIZE / 2)
      ctx.lineTo(SIZE, SIZE / 2)
      ctx.stroke()

      const trail = trailRef.current
      trail.forEach((p, i) => {
        const alpha = ((i + 1) / trail.length) * TRAIL_MAX_ALPHA
        const { cx: tx, cy: ty } = toCanvas(p.x, p.y)
        ctx.fillStyle = `rgba(${ACCENT_RGB}, ${alpha})`
        ctx.beginPath()
        ctx.arc(tx, ty, 5, 0, Math.PI * 2)
        ctx.fill()
      })

      const { cx, cy } = toCanvas(pos.x, pos.y)
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(cx, cy, 8, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  const joy = latestByKey.JOY
  return (
    <WidgetCard title="Joystick (JOY)" accentColor={ACCENT}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="rounded border border-neutral-800 bg-neutral-950"
      />
      <div className="mt-2 text-xs text-neutral-500">
        x: {joy?.x ?? '—'} &nbsp; y: {joy?.y ?? '—'}
      </div>
    </WidgetCard>
  )
}

export default JoystickWidget
