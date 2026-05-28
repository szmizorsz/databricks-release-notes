import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { getRuns } from '@/lib/kv'

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await getRuns())
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
