import { kv } from '@vercel/kv'
import type { Config, RunEntry } from './types'

const MAX_RUNS = 30

export async function getConfig(): Promise<Config | null> {
  return kv.get<Config>('config')
}

export async function setConfig(config: Config): Promise<void> {
  await kv.set('config', config)
}

export async function getRuns(): Promise<RunEntry[]> {
  const runs = await kv.get<RunEntry[]>('runs')
  return runs ?? []
}

export async function appendRun(run: RunEntry): Promise<void> {
  const existing = await getRuns()
  await kv.set('runs', [run, ...existing].slice(0, MAX_RUNS))
}
