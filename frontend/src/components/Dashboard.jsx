import { registry } from '../widgets/registry.js'

function Dashboard({ latestByKey, historyByKey, widgetState, onToggleExpand, onHide, onClearHistory }) {
  const visible = registry.filter((w) => widgetState[w.id]?.visible)

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(({ id, Component, hasHistory }) => {
        const state = widgetState[id]
        return (
          <div key={id} className={state.expanded ? 'sm:col-span-2 lg:col-span-3' : ''}>
            <Component
              latestByKey={latestByKey}
              historyByKey={historyByKey}
              expanded={state.expanded}
              onToggleExpand={() => onToggleExpand(id)}
              onHide={() => onHide(id)}
              onClear={hasHistory ? () => onClearHistory(id) : undefined}
              resetToken={state.resetToken}
            />
          </div>
        )
      })}
    </div>
  )
}

export default Dashboard
