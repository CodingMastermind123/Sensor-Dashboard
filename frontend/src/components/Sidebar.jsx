/**
 * Left nav listing every registered widget with a show/hide checkbox. Visibility state
 * lives in App.jsx (widgetState) — this component is a dumb list bound to it, driving
 * the same shared state a widget card's own hide (x) button also updates.
 */
function Sidebar({ registry, widgetState, onToggleVisible }) {
  return (
    <aside className="w-48 shrink-0 border-r border-neutral-800 bg-neutral-900 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Widgets
      </h2>
      <ul className="space-y-1">
        {registry.map((w) => (
          <li key={w.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={widgetState[w.id]?.visible ?? true}
                onChange={() => onToggleVisible(w.id)}
              />
              {w.title}
            </label>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default Sidebar
