'use server'

import { runDigest } from '@/lib/digest'
import { setConfig } from '@/lib/kv'
import type { RunEntry } from '@/lib/types'

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function triggerDigestAction(): Promise<RunEntry> {
  return runDigest()
}

export async function saveConfigAction(email: string): Promise<void> {
  if (!email || !isValidEmail(email)) throw new Error('Invalid email address')
  await setConfig({ email })
}
