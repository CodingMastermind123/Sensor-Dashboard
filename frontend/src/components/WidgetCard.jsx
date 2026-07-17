const ICON_BUTTON_CLASS =
  'rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200'

/**
 * Generic card shell shared by all widgets: title bar + accent color + content slot +
 * header controls (expand, clear-history, hide). This component holds no state of its
 * own — callers (widget components, forwarding props threaded down from Dashboard.jsx)
 * own expanded/visibility state. A control button only renders if its handler is passed
 * (e.g. `onClear` is omitted for widgets with `hasHistory: false` in the registry).
 * The header carries `widget-drag-handle` (react-grid-layout's `draggableHandle`
 * selector) so only it can start a drag — every button additionally stops the
 * mousedown from propagating so a click never gets swallowed as a drag-start.
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-900/70 p-4 shadow-lg shadow-black/40">
      <div className="widget-drag-handle mb-3 flex items-center justify-between">
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
              onMouseDown={(e) => e.stopPropagation()}
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
              onMouseDown={(e) => e.stopPropagation()}
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
              onMouseDown={(e) => e.stopPropagation()}
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
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export default WidgetCard
