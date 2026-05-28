'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerDigestAction } from '@/app/actions'
import type { RunEntry } from '@/lib/types'

export function ManualRunButton() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<RunEntry | null>(null)

  async function handleRun() {
    setStatus('running')
    setResult(null)
    try {
      const run = await triggerDigestAction()
      setResult(run)
      setStatus('done')
      router.refresh()
    } catch (err) {
      setResult({
        id: '',
        timestamp: new Date().toISOString(),
        status: 'error',
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
      setStatus('done')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Manual Run</p>
        <p className="text-xs text-gray-500 mt-0.5">Trigger a digest run right now, outside the schedule</p>
        {result && (
          <p className={`text-xs mt-1 font-medium ${
            result.status === 'success' ? 'text-green-600'
            : result.status === 'skipped' ? 'text-yellow-600'
            : 'text-red-600'
          }`}>
            {result.status === 'success' ? `Sent — ${result.itemCount} items`
              : result.status === 'skipped' ? 'Skipped — no new content'
              : `Error: ${result.error}`}
          </p>
        )}
      </div>
      <button
        onClick={handleRun}
        disabled={status === 'running'}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {status === 'running' ? 'Running…' : 'Run Now'}
      </button>
    </div>
  )
}
