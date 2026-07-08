import { useSensorSocket } from './hooks/useSensorSocket.js'
import ConnectionBar from './components/ConnectionBar.jsx'
import Dashboard from './components/Dashboard.jsx'

function App() {
  const { connected, port, dataRateHz, latestByKey, historyByKey } = useSensorSocket()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ConnectionBar connected={connected} port={port} dataRateHz={dataRateHz} />
      <Dashboard latestByKey={latestByKey} historyByKey={historyByKey} />
    </div>
  )
}

export default App
