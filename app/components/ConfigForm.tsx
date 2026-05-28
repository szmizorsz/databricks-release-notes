'use client'

import { useState } from 'react'
import { saveConfigAction } from '@/app/actions'

export function ConfigForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')
    try {
      await saveConfigAction(email)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed')
      setStatus('error')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuration</h2>
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Target email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
            required
          />
        </div>
        <button
          type="submit"
          disabled={status === 'saving'}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved!' : 'Save'}
        </button>
      </form>
      {status === 'error' && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
    </div>
  )
}
