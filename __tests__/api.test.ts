import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/digest', () => ({ runDigest: vi.fn() }))
vi.mock('@/lib/kv', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  getRuns: vi.fn(),
}))

process.env.DIGEST_SECRET = 'test-secret'

import { POST as digestPost } from '@/app/api/digest/route'
import { GET as configGet, PUT as configPut } from '@/app/api/config/route'
import { GET as runsGet } from '@/app/api/runs/route'
import { runDigest } from '@/lib/digest'
import { getConfig, setConfig, getRuns } from '@/lib/kv'

const mockRunDigest = vi.mocked(runDigest)
const mockGetConfig = vi.mocked(getConfig)
const mockSetConfig = vi.mocked(setConfig)
const mockGetRuns = vi.mocked(getRuns)

function authedRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost', {
    method,
    headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

function unauthRequest(method: string): Request {
  return new Request('http://localhost', { method })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/digest', () => {
  it('returns 401 without token', async () => {
    expect((await digestPost(unauthRequest('POST'))).status).toBe(401)
  })

  it('runs digest and returns result', async () => {
    mockRunDigest.mockResolvedValueOnce({ id: 'abc', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 5 })
    const res = await digestPost(authedRequest('POST'))
    expect(res.status).toBe(200)
    expect((await res.json()).itemCount).toBe(5)
  })
})

describe('GET /api/config', () => {
  it('returns 401 without token', async () => {
    expect((await configGet(unauthRequest('GET'))).status).toBe(401)
  })

  it('returns current config', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    const res = await configGet(authedRequest('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).email).toBe('user@example.com')
  })

  it('returns empty object when no config set', async () => {
    mockGetConfig.mockResolvedValueOnce(null)
    const res = await configGet(authedRequest('GET'))
    expect(await res.json()).toEqual({})
  })
})

describe('PUT /api/config', () => {
  it('returns 401 without token', async () => {
    expect((await configPut(unauthRequest('PUT'))).status).toBe(401)
  })

  it('saves config and returns 200', async () => {
    mockSetConfig.mockResolvedValueOnce(undefined)
    const res = await configPut(authedRequest('PUT', { email: 'new@example.com' }))
    expect(res.status).toBe(200)
    expect(mockSetConfig).toHaveBeenCalledWith({ email: 'new@example.com' })
  })

  it('returns 400 when email is missing', async () => {
    expect((await configPut(authedRequest('PUT', {}))).status).toBe(400)
  })
})

describe('GET /api/runs', () => {
  it('returns 401 without token', async () => {
    expect((await runsGet(unauthRequest('GET'))).status).toBe(401)
  })

  it('returns run history', async () => {
    const runs = [{ id: '1', timestamp: '2026-05-28T08:00:00Z', status: 'success' as const, itemCount: 3 }]
    mockGetRuns.mockResolvedValueOnce(runs)
    const res = await runsGet(authedRequest('GET'))
    expect(await res.json()).toEqual(runs)
  })
})
