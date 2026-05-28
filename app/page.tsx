import { getConfig, getRuns } from '@/lib/kv'
import { ConfigForm } from '@/app/components/ConfigForm'
import { ManualRunButton } from '@/app/components/ManualRunButton'
import { RunHistory } from '@/app/components/RunHistory'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const [config, runs] = await Promise.all([getConfig(), getRuns()])

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Databricks Release Notes Digest</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin Dashboard</p>
        </div>
        <span className="text-xs text-gray-400">Scheduled: daily at 08:00 UTC</span>
      </div>
      <ConfigForm initialEmail={config?.email ?? ''} />
      <ManualRunButton />
      <RunHistory runs={runs} />
    </main>
  )
}
