import GridLayout from 'react-grid-layout'
import { registry } from '../widgets/registry.js'
import { useWidgetLayout } from '../hooks/useWidgetLayout.js'
import { useContainerWidth } from '../hooks/useContainerWidth.js'
import { COLS } from '../hooks/layoutUtils.js'

const ROW_HEIGHT = 30
const MARGIN = [16, 16]

function Dashboard({ latestByKey, historyByKey, widgetState, onHide, onClearHistory }) {
  const visible = registry.filter((w) => widgetState[w.id]?.visible)
  const visibleIds = visible.map((w) => w.id)
  const registryIds = registry.map((w) => w.id)

  const { visibleLayout, onLayoutChange, expandWidget, collapseWidget } = useWidgetLayout(registryIds)
  const [containerRef, containerWidth] = useContainerWidth()

  const items = visibleLayout(visibleIds)

  return (
    <div ref={containerRef} className="p-4">
      {containerWidth > 0 && (
        // react-grid-layout 2.x's default GridLayout export takes a composable
        // gridConfig/dragConfig/resizeConfig object API, not v1's flat cols/
        // rowHeight/margin/draggableHandle props — passing those directly is
        // silently accepted (no error, no warning) but ignored, falling back to
        // the library's own defaults (rowHeight 150, margin [10,10], no drag
        // handle restriction at all). Only caught via manual browser testing;
        // `npm run build` and a plain code diff can't detect it.
        <GridLayout
          gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
          dragConfig={{ handle: '.widget-drag-handle' }}
          width={containerWidth}
          layout={items}
          onLayoutChange={onLayoutChange}
        >
          {visible.map(({ id, Component, hasHistory }) => {
            const state = widgetState[id]
            const item = items.find((it) => it.i === id)
            const expanded = item?.w === COLS

            return (
              <div key={id}>
                <Component
                  latestByKey={latestByKey}
                  historyByKey={historyByKey}
                  expanded={expanded}
                  onToggleExpand={() => (expanded ? collapseWidget(id) : expandWidget(id))}
                  onHide={() => onHide(id)}
                  onClear={hasHistory ? () => onClearHistory(id) : undefined}
                  resetToken={state.resetToken}
                />
              </div>
            )
          })}
        </GridLayout>
      )}
    </div>
  )
}

export default Dashboard
