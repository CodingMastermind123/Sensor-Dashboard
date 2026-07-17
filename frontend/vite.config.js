import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // react-grid-layout bundles react-draggable, whose drag-start handler reads
    // process.env.DRAGGABLE_DEBUG. There's no `process` global in a browser/Vite
    // build, so without this define, the very first mousedown on a drag handle
    // throws "ReferenceError: process is not defined" and the drag never starts.
    // Known upstream issue: https://github.com/react-grid-layout/react-grid-layout/issues/2268
    'process.env.DRAGGABLE_DEBUG': 'undefined',
  },
})
