import { isAdmin } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { amountDue, groupSizes } from '@/lib/calc';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // stop spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET() {
  if (!(await isAdmin())) return new Response('Not allowed', { status: 403 });
  const { settings: s, members } = await readDb();
  const header = [
    'Name', 'Phone', 'Club', 'Going', 'People with member (going)', 'Going total', 'Stay total',
    'Coming back', 'People with member (back)', 'Back total', 'Amount (Rs.)', 'Payment status', 'Reference', 'Slip uploaded',
  ];
  const rows = members.map(m => {
    const g = groupSizes(m);
    return [
      m.name, m.phone, m.club,
      m.going === null ? '' : m.going ? 'Yes' : 'No', m.goingGuests, g.going, g.stay,
      m.returning === null ? '' : m.returning ? 'Yes' : 'No', m.returnGuests, g.ret,
      amountDue(m, s), m.payment.status, m.payment.reference, m.payment.uploadedAt ?? '',
    ];
  });
  const csv = '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="batticaloa-headcount.csv"',
    },
  });
}
