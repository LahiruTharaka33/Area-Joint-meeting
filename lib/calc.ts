import type { Member, Settings } from './db';

export function groupSizes(m: Member) {
  const going = m.going ? 1 + m.goingGuests : 0;
  const ret = m.returning ? 1 + m.returnGuests : 0;
  // Stay at the booked place uses the same headcount as the going bus.
  return { going, stay: going, ret };
}

export function breakdown(m: Member, s: Settings) {
  const g = groupSizes(m);
  return [
    { label: s.goingLabel, people: g.going, rate: s.rates.going },
    { label: s.stayLabel, people: g.stay, rate: s.rates.stay },
    { label: s.returnLabel, people: g.ret, rate: s.rates.return },
  ].filter(l => l.people > 0 && l.rate > 0);
}

export function calculatedAmount(m: Member, s: Settings) {
  return breakdown(m, s).reduce((sum, l) => sum + l.people * l.rate, 0);
}

export function amountDue(m: Member, s: Settings) {
  return m.amountOverride ?? calculatedAmount(m, s);
}

export function totals(members: Member[], s: Settings) {
  const t = {
    registered: members.length,
    responded: 0,
    going: { members: 0, others: 0 },
    ret: { members: 0, others: 0 },
    expected: 0,
    verified: 0,
    toCheck: 0,
  };
  for (const m of members) {
    if (m.going !== null) t.responded++;
    if (m.going) {
      t.going.members++;
      t.going.others += m.goingGuests;
    }
    if (m.returning) {
      t.ret.members++;
      t.ret.others += m.returnGuests;
    }
    const due = amountDue(m, s);
    t.expected += due;
    if (m.payment.status === 'verified') t.verified += due;
    if (m.payment.status === 'submitted') t.toCheck++;
  }
  return t;
}

export const rs = (n: number) => 'Rs. ' + n.toLocaleString('en-LK', { maximumFractionDigits: 2 });
