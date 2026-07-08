function ConnectionBar({ connected, port, dataRateHz }) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span className="font-medium text-neutral-100">
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">source: {port ?? 'unknown'}</span>
      <span className="text-neutral-500">·</span>
      <span className="text-neutral-400">{dataRateHz.toFixed(0)} Hz</span>
    </div>
  )
}

export default ConnectionBar
