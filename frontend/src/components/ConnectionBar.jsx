import { useEffect, useRef, useState } from 'react'

const API_BASE = (import.meta.env.VITE_WS_URL || 'ws://localhost:8080').replace(/^ws/, 'http')

/**
 * `recording` is driven by the WS status envelope (via App.jsx / useSensorSocket), not
 * local component state — that way it reflects true backend state (correct after a
 * page reload, a second browser tab, or a backend restart mid-session) rather than
 * just the last button click.
 */
function ConnectionBar({ connected, port, dataRateHz, paused, onTogglePause, recording }) {
  const [sessions, setSessions] = useState([])
  const [showSessions, setShowSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const prevRecording = useRef(recording)

  async function refreshSessions() {
    try {
      const res = await fetch(`${API_BASE}/sessions`)
      setSessions(await res.json())
    } catch {
      // backend unreachable — leave the last-known list in place
    }
  }

  useEffect(() => {
    refreshSessions()
  }, [])

  useEffect(() => {
    if (prevRecording.current && !recording) refreshSessions() // just stopped — pick up the new file
    prevRecording.current = recording
  }, [recording])

  async function toggleRecording() {
    setBusy(true)
    try {
      await fetch(`${API_BASE}/recording/${recording ? 'stop' : 'start'}`, { method: 'POST' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span className="font-medium text-neutral-100">
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">source: {port ?? 'unknown'}</span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">{dataRateHz.toFixed(0)} Hz</span>

      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          className={`rounded border px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50 ${
            recording ? 'border-red-600 text-red-400' : 'border-neutral-700 text-neutral-200'
          }`}
        >
          {recording ? '● Stop' : 'Record'}
        </button>

        <span className="relative">
          <button
            type="button"
            onClick={() => setShowSessions((s) => !s)}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Sessions ({sessions.length})
          </button>
          {showSessions && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded border border-neutral-800 bg-neutral-900 p-2 shadow-lg">
              {sessions.length === 0 ? (
                <div className="text-xs text-neutral-500">No sessions yet</div>
              ) : (
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.file}>
                      <a
                        href={`${API_BASE}/sessions/${s.file}`}
                        className="block truncate text-xs text-cyan-400 hover:underline"
                        download
                      >
                        {s.file}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </span>
      </span>
    </div>
  )
}

export default ConnectionBar
