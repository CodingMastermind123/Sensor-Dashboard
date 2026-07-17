import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEY, collapseItem, expandItem, mergeLayoutChange, reconcileLayout } from './layoutUtils.js'

function loadStoredLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveStoredLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage unavailable/full (e.g. private browsing) — layout just won't persist.
  }
}

/**
 * Owns the full per-widget layout array (position + size for every registry id,
 * including currently-hidden ones) and its localStorage persistence. Display-only
 * preference — never sent to the backend or involved in CSV recording.
 */
export function useWidgetLayout(registryIds) {
  const [layout, setLayout] = useState(() => reconcileLayout(loadStoredLayout(), registryIds))

  useEffect(() => {
    saveStoredLayout(layout)
  }, [layout])

  const visibleLayout = useCallback(
    (visibleIds) => layout.filter((item) => visibleIds.includes(item.i)),
    [layout],
  )

  const onLayoutChange = useCallback((changed) => {
    setLayout((prev) => mergeLayoutChange(prev, changed))
  }, [])

  const expandWidget = useCallback((id) => {
    setLayout((prev) => expandItem(prev, id))
  }, [])

  const collapseWidget = useCallback((id) => {
    setLayout((prev) => collapseItem(prev, id))
  }, [])

  return { layout, visibleLayout, onLayoutChange, expandWidget, collapseWidget }
}
