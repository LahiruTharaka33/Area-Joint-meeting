import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMember, type Member } from './db';

const COOKIE = 'bm_session';
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';

type Session = { role: 'member'; id: string } | { role: 'admin' };

function sign(value: string) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !safeEqual(sign(body), sig)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
  } catch {
    return null;
  }
}

export async function setSession(s: Session) {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 60,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentMember(): Promise<Member | null> {
  const s = await getSession();
  if (!s || s.role !== 'member') return null;
  return getMember(s.id);
}

export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect('/');
  return m;
}

export async function isAdmin() {
  return (await getSession())?.role === 'admin';
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login');
}

export function checkAdminPassword(input: string) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return safeEqual(input, pw);
}

export function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
