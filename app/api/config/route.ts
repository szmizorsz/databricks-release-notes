import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { getConfig, setConfig } from '@/lib/kv'

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = await getConfig()
  return NextResponse.json(config ?? {})
}

export async function PUT(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.email || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  await setConfig({ email: body.email })
  return NextResponse.json({ ok: true })
}
