import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { runDigest } from '@/lib/digest'

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runDigest()
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
