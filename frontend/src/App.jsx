import { useMemo, useState } from 'react'
import { useSensorSocket } from './hooks/useSensorSocket.js'
import { registry } from './widgets/registry.js'
import ConnectionBar from './components/ConnectionBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'

function initialWidgetState() {
  return Object.fromEntries(registry.map((w) => [w.id, { visible: true, resetToken: 0 }]))
}

function App() {
  const [paused, setPaused] = useState(false)
  const [widgetState, setWidgetState] = useState(initialWidgetState)
  const { connected, port, dataRateHz, recording, latestByKey, historyByKey, clearHistory } =
    useSensorSocket(paused)

  const keysById = useMemo(() => Object.fromEntries(registry.map((w) => [w.id, w.keys])), [])

  function toggleVisible(id) {
    setWidgetState((prev) => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }))
  }

  function hideWidget(id) {
    setWidgetState((prev) => ({ ...prev, [id]: { ...prev[id], visible: false } }))
  }

  function clearWidgetHistory(id) {
    clearHistory(keysById[id])
    setWidgetState((prev) => ({
      ...prev,
      [id]: { ...prev[id], resetToken: prev[id].resetToken + 1 },
    }))
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ConnectionBar
        connected={connected}
        port={port}
        dataRateHz={dataRateHz}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        recording={recording}
      />
      <div className="flex">
        <Sidebar registry={registry} widgetState={widgetState} onToggleVisible={toggleVisible} />
        <div className="flex-1">
          <Dashboard
            latestByKey={latestByKey}
            historyByKey={historyByKey}
            widgetState={widgetState}
            onHide={hideWidget}
            onClearHistory={clearWidgetHistory}
          />
        </div>
      </div>
    </div>
  )
}

export default App
