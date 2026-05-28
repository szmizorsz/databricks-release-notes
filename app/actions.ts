'use server'

import { runDigest } from '@/lib/digest'
import { setConfig } from '@/lib/kv'
import type { RunEntry } from '@/lib/types'

export async function triggerDigestAction(): Promise<RunEntry> {
  return runDigest()
}

export async function saveConfigAction(email: string): Promise<void> {
  if (!email || !email.includes('@')) throw new Error('Invalid email address')
  await setConfig({ email })
}
