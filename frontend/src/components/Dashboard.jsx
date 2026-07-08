import { registry } from '../widgets/registry.js'

function Dashboard({ latestByKey, historyByKey }) {
  const visible = registry.filter((w) => w.visible)

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(({ id, Component }) => (
        <Component key={id} latestByKey={latestByKey} historyByKey={historyByKey} />
      ))}
    </div>
  )
}

export default Dashboard
