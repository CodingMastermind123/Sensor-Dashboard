import { useEffect, useRef } from 'react'
import WidgetCard from '../components/WidgetCard.jsx'

const ACCENT = '#a78bfa'
const SIZE = 180
const RANGE_MAX = 1023
const LERP = 0.25

/**
 * 2D canvas dot tracking the joystick's raw {x,y} (0-1023 analog range) in real time.
 * Draws via requestAnimationFrame so motion stays smooth independent of React's render
 * cadence — the rAF loop reads the latest target from a ref rather than re-rendering.
 */
function JoystickWidget({ latestByKey }) {
  const canvasRef = useRef(null)
  const targetRef = useRef({ x: RANGE_MAX / 2, y: RANGE_MAX / 2 })
  const posRef = useRef({ x: RANGE_MAX / 2, y: RANGE_MAX / 2 })

  useEffect(() => {
    const joy = latestByKey.JOY
    if (joy && typeof joy.x === 'number' && typeof joy.y === 'number') {
      targetRef.current = joy
    }
  }, [latestByKey.JOY])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    function toCanvas(x, y) {
      return {
        cx: (x / RANGE_MAX) * SIZE,
        // Invert Y so "up" on the stick is up on screen.
        cy: SIZE - (y / RANGE_MAX) * SIZE,
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
