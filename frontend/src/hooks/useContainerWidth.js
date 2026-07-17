import { useEffect, useRef, useState } from 'react'

/** Returns [ref, width] — attach ref to the element whose rendered width should drive layout. */
export function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    // No separate synchronous initial read: observe() itself fires an initial
    // callback, and using only that (rather than also reading
    // getBoundingClientRect() here) avoids a border-box vs content-box mismatch
    // between the first width and every subsequent one.
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
