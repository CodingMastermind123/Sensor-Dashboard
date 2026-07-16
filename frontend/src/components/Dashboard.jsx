import { registry } from '../widgets/registry.js'

function Dashboard({ latestByKey, historyByKey, widgetState, onToggleExpand, onHide, onClearHistory }) {
  const visible = registry.filter((w) => widgetState[w.id]?.visible)

  return (
    // A CSS grid locks every card in a row to the same height (the tallest card's
    // height), which left dead whitespace below shorter cards (e.g. PIR) before the
    // next row started. Columns (masonry-style) let each column stack cards at their
    // own natural height instead, so the gap between any two stacked cards is just gap-4.
    <div className="columns-1 gap-4 p-4 sm:columns-2 lg:columns-3">
      {visible.map(({ id, Component, hasHistory }) => {
        const state = widgetState[id]
        return (
          <div
            key={id}
            className={`mb-4 break-inside-avoid ${state.expanded ? '[column-span:all]' : ''}`}
          >
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
