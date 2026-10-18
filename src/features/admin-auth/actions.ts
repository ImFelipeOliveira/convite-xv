'use server'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { db } from '@/server/db/client'
import { admins } from '@/server/db/schema'
import { verifyPassword } from './password'
import { createSession, destroySession } from './session'

export type SignInState = { error: string } | null

const BAD_CREDENTIALS = 'E-mail ou senha incorretos.'
// bcrypt (cost 12) of a long random throwaway string, so unknown e-mails cost the same as wrong passwords
const DUMMY_HASH = '$2b$12$sM1rS4CUQD9GI7newRIg.ORnRkFx/9oJZzX7NzjOIuRz1VmncgSJe'

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const ip = getClientIp(await headers())
  if (!rateLimit(`admin-login:${ip}`, { max: 5, windowMs: 15 * 60_000 }).ok) {
    logger.warn({ event: 'admin.sign_in_failed', reason: 'rate_limited' }, 'admin sign-in failed')
    return { error: BAD_CREDENTIALS }
  }
  const emailRaw = formData.get('email')
  const password = formData.get('password')
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''
  if (!email || typeof password !== 'string' || !password) {
    logger.warn({ event: 'admin.sign_in_failed', reason: 'bad_credentials' }, 'admin sign-in failed')
    return { error: BAD_CREDENTIALS }
  }
  if (!rateLimit(`admin-login-email:${email}`, { max: 10, windowMs: 15 * 60_000 }).ok) {
    logger.warn({ event: 'admin.sign_in_failed', reason: 'rate_limited' }, 'admin sign-in failed')
    return { error: BAD_CREDENTIALS }
  }
  const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1)
  const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH)
  if (!admin || !ok) {
    logger.warn({ event: 'admin.sign_in_failed', reason: 'bad_credentials' }, 'admin sign-in failed')
    return { error: BAD_CREDENTIALS }
  }
  await createSession(admin.id)
  logger.info({ event: 'admin.sign_in', adminId: admin.id }, 'admin signed in')
  redirect('/admin')
}

export async function signOut(): Promise<void> {
  await destroySession()
  redirect('/admin/login')
}
