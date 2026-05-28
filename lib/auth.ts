import { timingSafeEqual } from 'crypto'

export function isAuthorized(req: Request): boolean {
  const header = req.headers.get('Authorization')
  const secret = process.env.DIGEST_SECRET
  if (!secret || !header) return false
  try {
    const a = Buffer.from(header)
    const b = Buffer.from(`Bearer ${secret}`)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
