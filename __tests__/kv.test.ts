import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

import { kv } from '@vercel/kv'
import { getConfig, setConfig, getRuns, appendRun } from '@/lib/kv'
import type { Config, RunEntry } from '@/lib/types'

const mockGet = vi.mocked(kv.get)
const mockSet = vi.mocked(kv.set)

beforeEach(() => vi.clearAllMocks())

describe('getConfig', () => {
  it('returns stored config', async () => {
    mockGet.mockResolvedValueOnce({ email: 'test@example.com' } as Config)
    expect(await getConfig()).toEqual({ email: 'test@example.com' })
    expect(mockGet).toHaveBeenCalledWith('config')
  })

  it('returns null when nothing stored', async () => {
    mockGet.mockResolvedValueOnce(null)
    expect(await getConfig()).toBeNull()
  })
})

describe('setConfig', () => {
  it('writes config to KV', async () => {
    mockSet.mockResolvedValueOnce('OK' as never)
    await setConfig({ email: 'user@example.com' })
    expect(mockSet).toHaveBeenCalledWith('config', { email: 'user@example.com' })
  })
})

describe('getRuns', () => {
  it('returns stored runs', async () => {
    const runs: RunEntry[] = [
      { id: '1', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 5 },
    ]
    mockGet.mockResolvedValueOnce(runs)
    expect(await getRuns()).toEqual(runs)
  })

  it('returns empty array when nothing stored', async () => {
    mockGet.mockResolvedValueOnce(null)
    expect(await getRuns()).toEqual([])
  })
})

describe('appendRun', () => {
  it('prepends new run and caps at 30 entries', async () => {
    const existing: RunEntry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      timestamp: '2026-05-01T08:00:00Z',
      status: 'success' as const,
      itemCount: 1,
    }))
    mockGet.mockResolvedValueOnce(existing)
    mockSet.mockResolvedValueOnce('OK' as never)

    const newRun: RunEntry = { id: 'new', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 7 }
    await appendRun(newRun)

    const saved = mockSet.mock.calls[0][1] as RunEntry[]
    expect(saved).toHaveLength(30)
    expect(saved[0]).toEqual(newRun)
  })

  it('appends to empty list', async () => {
    mockGet.mockResolvedValueOnce(null)
    mockSet.mockResolvedValueOnce('OK' as never)

    const newRun: RunEntry = { id: 'first', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 3 }
    await appendRun(newRun)

    const saved = mockSet.mock.calls[0][1] as RunEntry[]
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual(newRun)
  })
})
