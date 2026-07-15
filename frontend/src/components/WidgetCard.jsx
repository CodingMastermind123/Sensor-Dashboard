const ICON_BUTTON_CLASS =
  'rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200'

/**
 * Generic card shell shared by all widgets: title bar + accent color + content slot +
 * header controls (expand, clear-history, hide). This component holds no state of its
 * own — callers (widget components, forwarding props threaded down from Dashboard.jsx)
 * own expanded/visibility state. A control button only renders if its handler is passed
 * (e.g. `onClear` is omitted for widgets with `hasHistory: false` in the registry).
 */
function WidgetCard({
  title,
  accentColor = '#22d3ee',
  expanded = false,
  onToggleExpand,
  onClear,
  onHide,
  children,
}) {
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
        <div className="flex items-center gap-1">
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className={ICON_BUTTON_CLASS}
              title={expanded ? 'Collapse' : 'Expand to full width'}
              aria-label={expanded ? 'Collapse' : 'Expand to full width'}
            >
              {expanded ? '⤡' : '⤢'}
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className={ICON_BUTTON_CLASS}
              title="Clear history"
              aria-label="Clear history"
            >
              ⟲
            </button>
          )}
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              className={ICON_BUTTON_CLASS}
              title="Hide widget"
              aria-label="Hide widget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

export default WidgetCard
