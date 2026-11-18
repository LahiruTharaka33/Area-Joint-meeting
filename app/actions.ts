'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import * as store from '@/lib/db';
import { normalizePhone, type PaymentStatus } from '@/lib/db';
import { paySummary } from '@/lib/calc';
import { setSession, clearSession, getSession, hashPin, verifyPin, checkAdminPassword, requireAdmin } from '@/lib/auth';

export type FormState = { error?: string; ok?: string } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const int = (fd: FormData, k: string, max = 30) => {
  const n = Math.floor(Number(fd.get(k)));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
};
const money = (fd: FormData, k: string) => {
  const n = Number(String(fd.get(k) ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

/* ---------------- Members ---------------- */

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, 'name').slice(0, 120);
  const phone = normalizePhone(str(fd, 'phone'));
  const club = str(fd, 'club').slice(0, 120);
  const pin = str(fd, 'pin');

  if (name.length < 2) return { error: 'Please enter your name.' };
  if (phone.length < 9 || phone.length > 12) return { error: 'Please enter a valid phone number, e.g. 0771234567.' };
  if (!club) return { error: 'Please enter your club or branch.' };
  if (!/^\d{4,6}$/.test(pin)) return { error: 'PIN must be 4 to 6 digits.' };
  if (pin !== str(fd, 'pin2')) return { error: 'The two PINs do not match.' };

  const id = crypto.randomUUID();
  const created = await store.createMember({ id, name, phone, club, pinHash: hashPin(pin) });
  if (!created) return { error: 'This phone number is already registered. Please log in instead.' };

  await setSession({ role: 'member', id });
  redirect('/headcount');
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const phone = normalizePhone(str(fd, 'phone'));
  const pin = str(fd, 'pin');
  if (await store.loginBlocked(phone)) return { error: 'Too many wrong tries. Please wait 10 minutes and try again.' };

  const m = await store.getMemberByPhone(phone);
  if (!m || !verifyPin(pin, m.pinHash)) {
    await store.recordLoginFail(phone);
    return { error: 'Phone number or PIN is wrong. Forgot your PIN? Ask the organiser to reset it.' };
  }
  await store.clearLoginFails(phone);
  await setSession({ role: 'member', id: m.id });
  redirect(m.going === null ? '/headcount' : '/dashboard');
}

export async function logout() {
  await clearSession();
  redirect('/');
}

async function memberId() {
  const s = await getSession();
  if (!s || s.role !== 'member') redirect('/');
  return s.id;
}

export async function saveHeadcount(_: FormState, fd: FormData): Promise<FormState> {
  const id = await memberId();
  const going = str(fd, 'going');
  const returning = str(fd, 'returning');
  if (going !== 'yes' && going !== 'no') return { error: 'Please choose whether you are taking the going bus.' };
  if (returning !== 'yes' && returning !== 'no') return { error: 'Please choose whether you are taking the coming-back bus.' };

  const settings = await store.getSettings();
  if (settings.headcountLocked) return { error: 'The headcount is closed. Please contact the organiser to change it.' };

  await store.updateHeadcount(id, {
    going: going === 'yes',
    goingGuests: going === 'yes' ? int(fd, 'goingGuests') : 0,
    staying: going === 'yes' ? str(fd, 'staying') !== 'no' : true,
    returning: returning === 'yes',
    returnGuests: returning === 'yes' ? int(fd, 'returnGuests') : 0,
  });
  revalidatePath('/', 'layout');
  redirect('/dashboard?saved=1');
}

const SLIP_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
// Vercel rejects request bodies over ~4.5 MB; photos are shrunk in the browser before upload.
const MAX_SLIP = 4 * 1024 * 1024;

export async function uploadSlip(_: FormState, fd: FormData): Promise<FormState> {
  const id = await memberId();
  const file = fd.get('slip');
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo or PDF of your slip.' };
  if (file.size > MAX_SLIP) return { error: 'The file is larger than 4 MB. Please send a smaller photo or PDF.' };
  if (!SLIP_TYPES.has(file.type)) return { error: 'Please upload a photo (JPG, PNG) or a PDF.' };

  const [current, settings] = await Promise.all([store.getMember(id), store.getSettings()]);
  if (!current) return { error: 'Your account was not found.' };
  const pay = paySummary(current, settings);
  if (pay.full <= 0) return { error: 'Payment details are not ready yet.' };
  if (pay.balance <= 0) return { error: 'You have already paid the full amount.' };
  if (current.payment.slips.length >= 10) return { error: 'Too many slips uploaded. Please contact the organiser.' };

  await store.addSlip(id, crypto.randomUUID(), file.type, Buffer.from(await file.arrayBuffer()), str(fd, 'reference').slice(0, 200));
  revalidatePath('/', 'layout');
  return { ok: 'Slip uploaded. The organiser will check it and confirm.' };
}

/* ---------------- Organiser ---------------- */

export async function adminLogin(_: FormState, fd: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: 'ADMIN_PASSWORD is not set on the server.' };
  if (await store.loginBlocked('admin')) return { error: 'Too many wrong tries. Please wait 10 minutes.' };
  if (!checkAdminPassword(str(fd, 'password'))) {
    await store.recordLoginFail('admin');
    return { error: 'Wrong password.' };
  }
  await store.clearLoginFails('admin');
  await setSession({ role: 'admin' });
  redirect('/admin');
}

export async function adminLogout() {
  await clearSession();
  redirect('/admin/login');
}

export async function saveSettings(fd: FormData) {
  await requireAdmin();
  const s = await store.getSettings();
  s.eventName = str(fd, 'eventName') || s.eventName;
  s.goingLabel = str(fd, 'goingLabel') || s.goingLabel;
  s.stayLabel = str(fd, 'stayLabel') || s.stayLabel;
  s.returnLabel = str(fd, 'returnLabel') || s.returnLabel;
  s.rates = { going: money(fd, 'rateGoing'), stay: money(fd, 'rateStay'), return: money(fd, 'rateReturn') };
  s.advancePerPerson = money(fd, 'advancePerPerson');
  s.bank = {
    accountName: str(fd, 'accountName'),
    bankName: str(fd, 'bankName'),
    branch: str(fd, 'branch'),
    accountNumber: str(fd, 'accountNumber'),
    note: str(fd, 'bankNote'),
  };
  s.headcountLocked = fd.get('headcountLocked') === 'on';
  await store.saveSettings(s);
  revalidatePath('/', 'layout');
  redirect('/admin?msg=settings#payment-details');
}

export async function receivePayment(fd: FormData) {
  fd.set('status', 'verified');
  return setPaymentStatus(fd);
}

export async function rejectSlip(fd: FormData) {
  fd.set('status', 'rejected');
  return setPaymentStatus(fd);
}

export async function setPaymentStatus(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  const status = str(fd, 'status') as PaymentStatus;
  if (!['none', 'submitted', 'verified', 'rejected'].includes(status)) redirect(`/admin#m-${id}`);
  // "Save received" stores the total received; reject / reset leave it unchanged.
  const paid = status === 'verified' ? money(fd, 'paidAmount') : null;
  await store.recordPayment(id, status, paid, str(fd, 'adminNote').slice(0, 300));
  revalidatePath('/', 'layout');
  redirect(`/admin?msg=payment#m-${id}`);
}

export async function setAmountOverride(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  await store.setOverrides(
    id,
    str(fd, 'amount') === '' ? null : money(fd, 'amount'),
    str(fd, 'advance') === '' ? null : money(fd, 'advance'),
  );
  revalidatePath('/', 'layout');
  redirect(`/admin?msg=amount#m-${id}`);
}

export async function adminEditHeadcount(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  const goingRaw = str(fd, 'going');
  const returningRaw = str(fd, 'returning');
  if (!['yes', 'no'].includes(goingRaw) || !['yes', 'no'].includes(returningRaw)) {
    redirect(`/admin?msg=badanswer&edit=${id}#m-${id}`);
  }
  const going = goingRaw === 'yes';
  const returning = returningRaw === 'yes';
  await store.updateHeadcount(id, {
    going,
    goingGuests: going ? int(fd, 'goingGuests') : 0,
    staying: going ? str(fd, 'staying') !== 'no' : true,
    returning,
    returnGuests: returning ? int(fd, 'returnGuests') : 0,
  });
  revalidatePath('/', 'layout');
  redirect(`/admin?msg=headcount&edit=${id}#m-${id}`);
}

export async function resetPin(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  const pin = str(fd, 'pin');
  if (!/^\d{4,6}$/.test(pin)) redirect(`/admin?msg=badpin#m-${id}`);
  await store.setPinHash(id, hashPin(pin));
  redirect(`/admin?msg=pin#m-${id}`);
}

export async function deleteMember(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  if (str(fd, 'confirm') !== 'DELETE') redirect(`/admin?msg=noconfirm#m-${id}`);
  await store.deleteMember(id);
  revalidatePath('/', 'layout');
  redirect('/admin?msg=deleted');
}
