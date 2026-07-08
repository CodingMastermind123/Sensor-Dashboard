/**
 * Generic card shell shared by all widgets: title bar + accent color + content slot.
 * Per-widget controls (show/hide, expand, clear history) are Phase 2 — stubbed here.
 */
function WidgetCard({ title, accentColor = '#22d3ee', children }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          {title}
        </h2>
        {/* TODO (Phase 2): show/hide, expand-to-full-width, clear-graph-history controls */}
      </div>
      {children}
    </div>
  )
}

export default WidgetCard
