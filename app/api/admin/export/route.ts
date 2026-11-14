import { isAdmin } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { groupSizes, paySummary, PAY_STATE_LABEL } from '@/lib/calc';

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
    'Name', 'Phone', 'Club', 'Going', 'People with member (going)', 'Going total',
    'Staying at booked place', 'Stay total',
    'Coming back', 'People with member (back)', 'Back total',
    'Full price (Rs.)', 'Advance (Rs.)', 'Received (Rs.)', 'Balance (Rs.)', 'Payment', 'Slips', 'Last slip reference',
  ];
  const rows = members.map(m => {
    const g = groupSizes(m);
    const p = paySummary(m, s);
    const last = m.payment.slips.at(-1);
    return [
      m.name, m.phone, m.club,
      m.going === null ? '' : m.going ? 'Yes' : 'No', m.goingGuests, g.going,
      m.going ? (m.staying ? 'Yes' : 'No') : '', g.stay,
      m.returning === null ? '' : m.returning ? 'Yes' : 'No', m.returnGuests, g.ret,
      p.full, p.advance, p.paid, p.balance,
      m.payment.status === 'submitted' ? 'Slip to check' : PAY_STATE_LABEL[p.state],
      m.payment.slips.length, last?.reference ?? '',
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
