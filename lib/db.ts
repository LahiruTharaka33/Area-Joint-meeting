import path from 'path';

/**
 * Postgres storage.
 * - On Vercel (or anywhere with DATABASE_URL / POSTGRES_URL set): Neon serverless driver.
 * - Locally without a URL: an embedded Postgres (PGlite) saved in ./data/pglite,
 *   so `npm run dev` works with no setup.
 * Tables are created automatically on first use.
 */

export type PaymentStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export type Member = {
  id: string;
  name: string;
  phone: string;
  club: string;
  pinHash: string;
  createdAt: string;
  /** null = not answered yet */
  going: boolean | null;
  /** people coming with the member on the going bus (not counting the member) */
  goingGuests: number;
  returning: boolean | null;
  returnGuests: number;
  updatedAt: string | null;
  /** organiser can set a custom amount for this member */
  amountOverride: number | null;
  payment: {
    status: PaymentStatus;
    hasSlip: boolean;
    slipType: string | null;
    uploadedAt: string | null;
    reference: string;
    adminNote: string;
  };
};

export type Settings = {
  eventName: string;
  goingLabel: string;
  stayLabel: string;
  returnLabel: string;
  /** per person, in rupees */
  rates: { going: number; stay: number; return: number };
  bank: { accountName: string; bankName: string; branch: string; accountNumber: string; note: string };
  headcountLocked: boolean;
};

export const defaultSettings = (): Settings => ({
  eventName: 'Area Joint Meeting – Batticaloa',
  goingLabel: '4th night bus',
  stayLabel: '5th morning stay',
  returnLabel: '5th night bus',
  rates: { going: 0, stay: 0, return: 0 },
  bank: { accountName: '', bankName: '', branch: '', accountNumber: '', note: '' },
  headcountLocked: false,
});

/* ---------------- connection ---------------- */

type Row = Record<string, unknown>;
type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  phone           text NOT NULL UNIQUE,
  club            text NOT NULL DEFAULT '',
  pin_hash        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_going        boolean,
  going_guests    integer NOT NULL DEFAULT 0,
  is_returning    boolean,
  return_guests   integer NOT NULL DEFAULT 0,
  updated_at      timestamptz,
  amount_override double precision,
  pay_status      text NOT NULL DEFAULT 'none',
  pay_reference   text NOT NULL DEFAULT '',
  admin_note      text NOT NULL DEFAULT '',
  slip_type       text,
  slip_uploaded_at timestamptz
);
CREATE TABLE IF NOT EXISTS slips (
  member_id   text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  data_b64    text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  id   integer PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS login_fails (
  key   text PRIMARY KEY,
  n     integer NOT NULL DEFAULT 0,
  until timestamptz
);
`;

const g = globalThis as unknown as { __bmQuery?: Promise<QueryFn> };

/**
 * Find the Postgres URL. Vercel's Neon integration may add a prefix
 * (e.g. STORAGE_DATABASE_URL), so look for those too.
 */
function databaseUrl(): string | undefined {
  const env = process.env;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const key = Object.keys(env).find(k => /(^|_)DATABASE_URL$/.test(k) && !/UNPOOLED/.test(k))
    ?? Object.keys(env).find(k => /(^|_)POSTGRES_URL$/.test(k));
  return key ? env[key] : undefined;
}

async function connect(): Promise<QueryFn> {
  const url = databaseUrl();
  let q: QueryFn;
  if (!url && process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL is not set. In Vercel open Settings → Environment Variables, add DATABASE_URL ' +
      '(your Neon connection string) for Production, then redeploy.',
    );
  }
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    q = (text, params = []) => sql.query(text, params) as Promise<Row[]>;
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await q(stmt);
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const { mkdir } = await import('fs/promises');
    await mkdir(dir, { recursive: true });
    const db = new PGlite(path.join(dir, 'pglite'));
    await db.exec(SCHEMA);
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  return q;
}

async function query(text: string, params?: unknown[]) {
  if (!g.__bmQuery) {
    g.__bmQuery = connect();
    g.__bmQuery.catch(() => { g.__bmQuery = undefined; });
  }
  const q = await g.__bmQuery;
  return q(text, params);
}

/* ---------------- mapping ---------------- */

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const MEMBER_COLS = `id, name, phone, club, pin_hash, created_at, is_going, going_guests, is_returning,
  return_guests, updated_at, amount_override, pay_status, pay_reference, admin_note, slip_type, slip_uploaded_at`;

function toMember(r: Row): Member {
  return {
    id: r.id as string,
    name: r.name as string,
    phone: r.phone as string,
    club: r.club as string,
    pinHash: r.pin_hash as string,
    createdAt: iso(r.created_at) ?? '',
    going: (r.is_going as boolean | null) ?? null,
    goingGuests: Number(r.going_guests ?? 0),
    returning: (r.is_returning as boolean | null) ?? null,
    returnGuests: Number(r.return_guests ?? 0),
    updatedAt: iso(r.updated_at),
    amountOverride: num(r.amount_override),
    payment: {
      status: (r.pay_status as PaymentStatus) ?? 'none',
      hasSlip: !!r.slip_type,
      slipType: (r.slip_type as string | null) ?? null,
      uploadedAt: iso(r.slip_uploaded_at),
      reference: (r.pay_reference as string) ?? '',
      adminNote: (r.admin_note as string) ?? '',
    },
  };
}

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<Settings> {
  const rows = await query('SELECT data FROM settings WHERE id = 1');
  const d = defaultSettings();
  const raw = rows[0]?.data;
  const s = (typeof raw === 'string' ? JSON.parse(raw) : raw ?? {}) as Partial<Settings>;
  return { ...d, ...s, rates: { ...d.rates, ...s.rates }, bank: { ...d.bank, ...s.bank } };
}

export async function saveSettings(s: Settings) {
  await query(
    'INSERT INTO settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [JSON.stringify(s)],
  );
}

/* ---------------- members ---------------- */

export async function listMembers(): Promise<Member[]> {
  const rows = await query(`SELECT ${MEMBER_COLS} FROM members ORDER BY club, name`);
  return rows.map(toMember);
}

export async function readDb() {
  const [settings, members] = await Promise.all([getSettings(), listMembers()]);
  return { settings, members };
}

export async function getMember(id: string): Promise<Member | null> {
  const rows = await query(`SELECT ${MEMBER_COLS} FROM members WHERE id = $1`, [id]);
  return rows[0] ? toMember(rows[0]) : null;
}

export async function getMemberByPhone(phone: string): Promise<Member | null> {
  const rows = await query(`SELECT ${MEMBER_COLS} FROM members WHERE phone = $1`, [phone]);
  return rows[0] ? toMember(rows[0]) : null;
}

/** Returns false when the phone number is already registered. */
export async function createMember(m: { id: string; name: string; phone: string; club: string; pinHash: string }) {
  const rows = await query(
    `INSERT INTO members (id, name, phone, club, pin_hash) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (phone) DO NOTHING RETURNING id`,
    [m.id, m.name, m.phone, m.club, m.pinHash],
  );
  return rows.length > 0;
}

export async function updateHeadcount(
  id: string,
  h: { going: boolean; goingGuests: number; returning: boolean; returnGuests: number },
) {
  await query(
    `UPDATE members SET is_going = $2, going_guests = $3, is_returning = $4, return_guests = $5, updated_at = now()
     WHERE id = $1`,
    [id, h.going, h.goingGuests, h.returning, h.returnGuests],
  );
}

export async function setPayment(id: string, status: PaymentStatus, adminNote: string) {
  await query('UPDATE members SET pay_status = $2, admin_note = $3 WHERE id = $1', [id, status, adminNote]);
}

export async function setAmountOverride(id: string, amount: number | null) {
  await query('UPDATE members SET amount_override = $2 WHERE id = $1', [id, amount]);
}

export async function setPinHash(id: string, pinHash: string) {
  await query('UPDATE members SET pin_hash = $2 WHERE id = $1', [id, pinHash]);
}

export async function deleteMember(id: string) {
  await query('DELETE FROM slips WHERE member_id = $1', [id]);
  await query('DELETE FROM members WHERE id = $1', [id]);
}

/* ---------------- slips ---------------- */

export async function saveSlip(id: string, contentType: string, data: Buffer, reference: string) {
  await query(
    `INSERT INTO slips (member_id, content_type, data_b64, uploaded_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (member_id) DO UPDATE SET content_type = EXCLUDED.content_type, data_b64 = EXCLUDED.data_b64, uploaded_at = now()`,
    [id, contentType, data.toString('base64')],
  );
  await query(
    `UPDATE members SET pay_status = 'submitted', slip_type = $2, slip_uploaded_at = now(), pay_reference = $3
     WHERE id = $1`,
    [id, contentType, reference],
  );
}

export async function getSlip(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  const rows = await query('SELECT content_type, data_b64 FROM slips WHERE member_id = $1', [id]);
  if (!rows[0]) return null;
  return { contentType: rows[0].content_type as string, data: Buffer.from(rows[0].data_b64 as string, 'base64') };
}

/* ---------------- login brake ---------------- */

export async function loginBlocked(key: string) {
  const rows = await query('SELECT 1 FROM login_fails WHERE key = $1 AND until > now()', [key]);
  return rows.length > 0;
}

/** 5 wrong tries -> blocked for 10 minutes. */
export async function recordLoginFail(key: string) {
  await query(
    `INSERT INTO login_fails (key, n, until) VALUES ($1, 1, NULL)
     ON CONFLICT (key) DO UPDATE SET
       n = CASE WHEN login_fails.n + 1 >= 5 THEN 0 ELSE login_fails.n + 1 END,
       until = CASE WHEN login_fails.n + 1 >= 5 THEN now() + interval '10 minutes' ELSE login_fails.until END`,
    [key],
  );
}

export async function clearLoginFails(key: string) {
  await query('DELETE FROM login_fails WHERE key = $1', [key]);
}

/* ---------------- helpers ---------------- */

export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('94') && d.length === 11) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('7')) d = '0' + d;
  return d;
}
