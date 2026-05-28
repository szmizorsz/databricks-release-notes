'use client'

import type { RunEntry } from '@/lib/types'

function StatusBadge({ status }: { status: RunEntry['status'] }) {
  if (status === 'success') return <span className="text-green-600 font-medium text-sm">✓ success</span>
  if (status === 'skipped') return <span className="text-yellow-600 font-medium text-sm">— skipped</span>
  return <span className="text-red-600 font-medium text-sm">✗ error</span>
}

export function RunHistory({ runs }: { runs: RunEntry[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Run History <span className="font-normal normal-case text-gray-400">(last 30 runs)</span>
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-gray-400">No runs yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Timestamp</th>
              <th className="text-left pb-2 font-medium">Status</th>
              <th className="text-left pb-2 font-medium">Items</th>
              <th className="text-left pb-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 text-gray-700">{new Date(run.timestamp).toLocaleString()}</td>
                <td className="py-2.5"><StatusBadge status={run.status} /></td>
                <td className="py-2.5 text-gray-500">{run.itemCount ?? '—'}</td>
                <td className="py-2.5 text-xs text-gray-400">
                  {run.error ?? (run.status === 'skipped' ? 'No new content' : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
