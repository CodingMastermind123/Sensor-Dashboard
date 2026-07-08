import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
const HISTORY_CAP = 300
const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 5000

/**
 * Connects to the backend WebSocket, auto-reconnecting with backoff, and exposes live
 * sensor state plus a bounded per-key history for charts (ring buffer, capped at
 * HISTORY_CAP points — never an unbounded array).
 */
export function useSensorSocket() {
  const [connected, setConnected] = useState(false)
  const [port, setPort] = useState(null)
  const [dataRateHz, setDataRateHz] = useState(0)
  const [lastFrame, setLastFrame] = useState(null)
  const [latestByKey, setLatestByKey] = useState({})
  const [historyByKey, setHistoryByKey] = useState({})

  const wsRef = useRef(null)
  const reconnectDelayRef = useRef(RECONNECT_MIN_MS)
  const reconnectTimerRef = useRef(null)
  const mountedRef = useRef(true)

  const send = useCallback((obj) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }, [])

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!mountedRef.current) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelayRef.current = RECONNECT_MIN_MS
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_MS)
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'status') {
          setConnected(msg.connected)
          setPort(msg.port)
          setDataRateHz(msg.dataRateHz ?? 0)
        } else if (msg.type === 'sensors') {
          setLastFrame(msg)
          setLatestByKey((prev) => ({ ...prev, ...msg.data }))
          setHistoryByKey((prev) => {
            const next = { ...prev }
            for (const [key, value] of Object.entries(msg.data)) {
              if (typeof value !== 'number') continue
              const existing = next[key] ?? []
              const point = { t: msg.recvTs, v: value }
              next[key] = existing.length >= HISTORY_CAP
                ? [...existing.slice(existing.length - HISTORY_CAP + 1), point]
                : [...existing, point]
            }
            return next
          })
        }
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { connected, port, dataRateHz, lastFrame, latestByKey, historyByKey, send }
}
