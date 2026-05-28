export function isAuthorized(req: Request): boolean {
  const header = req.headers.get('Authorization')
  const secret = process.env.DIGEST_SECRET
  if (!secret) return false
  return header === `Bearer ${secret}`
}
