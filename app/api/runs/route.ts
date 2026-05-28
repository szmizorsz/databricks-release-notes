import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { getRuns } from '@/lib/kv'

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getRuns())
}
