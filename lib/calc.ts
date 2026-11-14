import type { Member, Settings } from './db';

export function groupSizes(m: Member) {
  const going = m.going ? 1 + m.goingGuests : 0;
  // Stay at the booked place: the going group, unless they said they are staying elsewhere.
  const stay = m.going && m.staying ? going : 0;
  const ret = m.returning ? 1 + m.returnGuests : 0;
  return { going, stay, ret };
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

/** Full price for this member's group. */
export function amountDue(m: Member, s: Settings) {
  return m.amountOverride ?? calculatedAmount(m, s);
}

/** People in the group used for the advance: the largest of going / coming back. */
export function groupPeople(m: Member) {
  const g = groupSizes(m);
  return Math.max(g.going, g.ret);
}

export function calculatedAdvance(m: Member, s: Settings) {
  return Math.min(amountDue(m, s), s.advancePerPerson * groupPeople(m));
}

/** Advance to pay now to confirm (never more than the full price). */
export function advanceDue(m: Member, s: Settings) {
  const full = amountDue(m, s);
  return Math.min(full, m.advanceOverride ?? calculatedAdvance(m, s));
}

export type PayState = 'nothing' | 'unpaid' | 'partial' | 'advance' | 'full';

export function paySummary(m: Member, s: Settings) {
  const full = amountDue(m, s);
  const advance = advanceDue(m, s);
  const paid = m.paidAmount;
  const balance = Math.max(0, full - paid);
  let state: PayState;
  if (full <= 0) state = 'nothing';
  else if (paid >= full) state = 'full';
  else if (advance > 0 && paid >= advance) state = 'advance';
  else if (paid > 0) state = 'partial';
  else state = 'unpaid';
  /** what the member should pay next */
  const payNow = state === 'unpaid' || state === 'partial'
    ? (advance > 0 ? advance - paid : balance)
    : balance;
  return { full, advance, paid, balance, payNow: Math.max(0, payNow), state };
}

export const PAY_STATE_LABEL: Record<PayState, string> = {
  nothing: '–',
  unpaid: 'Not paid',
  partial: 'Part paid',
  advance: 'Advance paid',
  full: 'Fully paid',
};

export function totals(members: Member[], s: Settings) {
  const t = {
    registered: members.length,
    responded: 0,
    going: { members: 0, others: 0 },
    stay: { members: 0, others: 0 },
    ret: { members: 0, others: 0 },
    expected: 0,
    advanceExpected: 0,
    received: 0,
    toCheck: 0,
  };
  for (const m of members) {
    if (m.going !== null) t.responded++;
    if (m.going) {
      t.going.members++;
      t.going.others += m.goingGuests;
      if (m.staying) {
        t.stay.members++;
        t.stay.others += m.goingGuests;
      }
    }
    if (m.returning) {
      t.ret.members++;
      t.ret.others += m.returnGuests;
    }
    t.expected += amountDue(m, s);
    t.advanceExpected += advanceDue(m, s);
    t.received += m.paidAmount;
    if (m.payment.status === 'submitted') t.toCheck++;
  }
  return t;
}

export const rs = (n: number) => 'Rs. ' + n.toLocaleString('en-LK', { maximumFractionDigits: 2 });
