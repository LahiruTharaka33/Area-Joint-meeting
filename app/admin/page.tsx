import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { readDb, type Member, type Settings } from '@/lib/db';
import { calculatedAdvance, calculatedAmount, groupSizes, paySummary, PAY_STATE_LABEL, rs, totals } from '@/lib/calc';
import Overview from './Overview';
import {
  adminLogout, saveSettings, receivePayment, rejectSlip, setAmountOverride, adminEditHeadcount, resetPin, deleteMember,
} from '../actions';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, [string, string]> = {
  settings: ['ok', 'Payment details saved.'],
  payment: ['ok', 'Payment updated.'],
  amount: ['ok', 'Price updated.'],
  headcount: ['ok', 'Headcount updated.'],
  pin: ['ok', 'PIN reset. Tell the member their new PIN.'],
  badpin: ['error', 'PIN must be 4 to 6 digits.'],
  deleted: ['ok', 'Member removed.'],
  noconfirm: ['error', 'Type DELETE in the box to remove a member.'],
};

const FILTERS = [
  ['all', 'All'],
  ['noreply', 'No answer yet'],
  ['going', 'Going'],
  ['tocheck', 'Slips to check'],
  ['unpaid', 'Advance not paid'],
  ['balance', 'Balance due'],
  ['full', 'Fully paid'],
] as const;

function matches(m: Member, s: Settings, f: string) {
  const p = paySummary(m, s);
  switch (f) {
    case 'noreply': return m.going === null;
    case 'going': return !!m.going;
    case 'tocheck': return m.payment.status === 'submitted';
    case 'unpaid': return p.state === 'unpaid' || p.state === 'partial';
    case 'balance': return p.full > 0 && p.balance > 0;
    case 'full': return p.state === 'full';
    default: return true;
  }
}

function payPill(m: Member, s: Settings): [string, string] {
  if (m.payment.status === 'submitted') return ['submitted', 'Slip to check'];
  const p = paySummary(m, s);
  if (p.state === 'full') return ['verified', 'Fully paid'];
  if (p.state === 'advance') return ['verified', 'Advance paid'];
  if (m.payment.status === 'rejected') return ['rejected', 'Rejected'];
  return ['none', PAY_STATE_LABEL[p.state]];
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string; f?: string }> }) {
  await requireAdmin();
  const { msg, f = 'all' } = await searchParams;
  const { settings: s, members } = await readDb();
  const t = totals(members, s);
  const goingTotal = t.going.members + t.going.others;
  const stayTotal = t.stay.members + t.stay.others;
  const retTotal = t.ret.members + t.ret.others;
  const allSorted = [...members].sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
  const list = allSorted.filter(m => matches(m, s, f));
  const clubMap = new Map<string, { club: string; members: number; going: number; stay: number; ret: number }>();
  for (const m of members) {
    const key = m.club.trim() || '—';
    const c = clubMap.get(key.toLowerCase()) ?? { club: key, members: 0, going: 0, stay: 0, ret: 0 };
    const g = groupSizes(m);
    c.members++;
    c.going += g.going;
    c.stay += g.stay;
    c.ret += g.ret;
    clubMap.set(key.toLowerCase(), c);
  }
  const clubs = [...clubMap.values()].sort((a, b) => a.club.localeCompare(b.club));
  const note = msg ? MESSAGES[msg] : undefined;

  return (
    <>
      <header className="hero wide">
        <div className="hero-inner">
          <div className="hero-top">
            <span className="eyebrow">Organiser · {s.eventName}</span>
            <form action={adminLogout}><button className="btn light sm">Log out</button></form>
          </div>
          <h1>Headcount</h1>
          <p style={{ opacity: 0.85 }}>
            {t.responded} of {t.registered} registered members have answered.
            {s.headcountLocked ? ' Headcount is closed.' : ' Headcount is open.'}
          </p>
        </div>
      </header>

      <main className="wrap wide">
        {note && <div className={`alert ${note[0]}`} role="status">{note[1]}</div>}

        <Overview members={members} settings={s} money={{ received: t.received, expected: t.expected, toCheck: t.toCheck }} />

        <section className="card" id="counts">
          <div className="card-head">
            <h2>All counts</h2>
            <a className="btn ghost sm" href="/api/admin/export">Download CSV</a>
          </div>
          {members.length === 0 ? (
            <p className="muted">No members yet. Share the site link so members can register.</p>
          ) : (
            <div className="table-scroll">
              <table className="counts">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Club</th>
                    <th className="num">Going</th>
                    <th className="num">Stay</th>
                    <th className="num">Back</th>
                    <th className="num">Full price</th>
                    <th className="num">Advance</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allSorted.map(m => {
                    const g = groupSizes(m);
                    const p = paySummary(m, s);
                    const [cls, label] = payPill(m, s);
                    return (
                      <tr key={m.id}>
                        <td><a href={`#m-${m.id}`}>{m.name}</a><div className="muted small">{m.phone}</div></td>
                        <td>{m.club}</td>
                        {m.going === null ? (
                          <td colSpan={3} className="muted">No answer yet</td>
                        ) : (
                          <>
                            <td className="num">{g.going}{m.goingGuests > 0 && <span className="muted small"> (1+{m.goingGuests})</span>}</td>
                            <td className="num">{m.going && !m.staying ? <span className="muted small">elsewhere</span> : g.stay}</td>
                            <td className="num">{g.ret}{m.returnGuests > 0 && <span className="muted small"> (1+{m.returnGuests})</span>}</td>
                          </>
                        )}
                        <td className="num">{p.full > 0 ? rs(p.full) : '–'}</td>
                        <td className="num">{p.advance > 0 ? rs(p.advance) : '–'}</td>
                        <td className="num">{p.paid > 0 ? rs(p.paid) : '–'}</td>
                        <td>{p.full > 0 ? <span className={`pill ${cls}`}>{label}</span> : <span className="muted small">No price yet</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total ({t.responded} answered)</td>
                    <td className="num">{goingTotal}</td>
                    <td className="num">{stayTotal}</td>
                    <td className="num">{retTotal}</td>
                    <td className="num">{rs(t.expected)}</td>
                    <td className="num">{rs(t.advanceExpected)}</td>
                    <td className="num">{rs(t.received)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {clubs.length > 1 && (
            <>
              <h3>By club</h3>
              <div className="table-scroll">
                <table className="counts">
                  <thead>
                    <tr><th>Club</th><th className="num">Members</th><th className="num">Going</th><th className="num">Stay</th><th className="num">Back</th></tr>
                  </thead>
                  <tbody>
                    {clubs.map(c => (
                      <tr key={c.club}>
                        <td>{c.club}</td>
                        <td className="num">{c.members}</td>
                        <td className="num">{c.going}</td>
                        <td className="num">{c.stay}</td>
                        <td className="num">{c.ret}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card" id="payment-details">
          <div className="card-head">
            <h2>Payment details</h2>
          </div>
          <p className="muted small">
            When you save a price here, every member who answered sees their full price, the advance to pay now
            and the bank details on their dashboard. Leave the prices empty until you have taken the full count.
          </p>
          <form action={saveSettings} style={{ display: 'grid', gap: 14 }}>
            <h3>Full price per person (Rs.)</h3>
            <div className="row">
              <label className="field">Going bus<input id="rateGoing" name="rateGoing" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.going || ''} /></label>
              <label className="field">Stay<input id="rateStay" name="rateStay" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.stay || ''} /></label>
              <label className="field">Coming-back bus<input id="rateReturn" name="rateReturn" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.return || ''} /></label>
            </div>
            <p className="muted small">
              Full price = (going people × going price) + (people staying at the booked place × stay price) + (coming-back people × coming-back price).
            </p>
            <h3>Advance to pay now (Rs.)</h3>
            <label className="field">
              Advance per person
              <span className="hint">Members pay this × the people in their group to confirm. The rest is paid later. Leave empty or 0 to ask for the full price.</span>
              <input id="advancePerPerson" name="advancePerPerson" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.advancePerPerson || ''} />
            </label>
            <h3>Bank details shown to members</h3>
            <div className="row">
              <label className="field">Account name<input id="accountName" name="accountName" type="text" defaultValue={s.bank.accountName} /></label>
              <label className="field">Bank<input id="bankName" name="bankName" type="text" defaultValue={s.bank.bankName} /></label>
              <label className="field">Branch<input id="branch" name="branch" type="text" defaultValue={s.bank.branch} /></label>
              <label className="field">Account number<input id="accountNumber" name="accountNumber" type="text" inputMode="numeric" defaultValue={s.bank.accountNumber} /></label>
            </div>
            <label className="field">Note for members <span className="hint">e.g. &quot;Use your name as the reference. Advance before 1st Dec, balance before 3rd Dec.&quot;</span>
              <textarea id="bankNote" name="bankNote" rows={2} defaultValue={s.bank.note} />
            </label>
            <h3>Headcount &amp; event</h3>
            <label className="check"><input id="headcountLocked" name="headcountLocked" type="checkbox" defaultChecked={s.headcountLocked} /> Close the headcount (members can no longer change their numbers)</label>
            <details>
              <summary className="muted small" style={{ cursor: 'pointer' }}>Event name and trip labels</summary>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <label className="field">Event name<input id="eventName" name="eventName" type="text" defaultValue={s.eventName} /></label>
                <div className="row">
                  <label className="field">Going label<input id="goingLabel" name="goingLabel" type="text" defaultValue={s.goingLabel} /></label>
                  <label className="field">Stay label<input id="stayLabel" name="stayLabel" type="text" defaultValue={s.stayLabel} /></label>
                  <label className="field">Coming-back label<input id="returnLabel" name="returnLabel" type="text" defaultValue={s.returnLabel} /></label>
                </div>
              </div>
            </details>
            <button className="btn">Save payment details</button>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Manage members ({list.length})</h2>
          </div>
          <p className="muted small">Check slips, record money received, set a custom price or advance, change numbers or reset a PIN.</p>
          <nav className="filters" aria-label="Filter members">
            {FILTERS.map(([key, label]) => (
              <Link key={key} href={key === 'all' ? '/admin' : `/admin?f=${key}`} aria-current={f === key ? 'page' : undefined}>
                {label} ({members.filter(m => matches(m, s, key)).length})
              </Link>
            ))}
          </nav>

          {list.length === 0 && <p className="muted">No members here.</p>}

          <div className="members">
            {list.map(m => {
              const g = groupSizes(m);
              const p = paySummary(m, s);
              const [cls, label] = payPill(m, s);
              const suggested = p.paid < p.advance ? p.advance : p.full;
              return (
                <details className="card member" key={m.id} id={`m-${m.id}`}>
                  <summary>
                    <span className="who">{m.name} <span className="muted small">· {m.club}</span></span>
                    <span className={`pill ${cls}`}>{label}</span>
                    <span className="nums">
                      {m.going === null
                        ? 'No answer yet'
                        : `Going ${g.going} · Stay ${g.stay} · Back ${g.ret}`}
                    </span>
                    <span className="nums">{rs(p.paid)} / {rs(p.full)}</span>
                  </summary>

                  <div className="member-body">
                    <p className="small">
                      Phone: <strong>{m.phone}</strong>
                      {m.updatedAt && <span className="muted"> · updated {new Date(m.updatedAt).toLocaleString('en-GB')}</span>}
                    </p>

                    {p.full > 0 && (
                      <div className="money small">
                        <div className="money-row"><span className="lbl">Full price</span><span className="val">{rs(p.full)}</span></div>
                        <div className="money-row"><span className="lbl">Advance</span><span className="val">{rs(p.advance)}</span></div>
                        <div className="money-row"><span className="lbl">Received</span><span className="val">{rs(p.paid)}</span></div>
                        <div className="money-row"><span className="lbl">Balance</span><span className="val">{rs(p.balance)}</span></div>
                      </div>
                    )}

                    {m.payment.slips.length > 0 && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <strong>Slips ({m.payment.slips.length})</strong>
                        {m.payment.slips.map((sl, i) => (
                          <div key={sl.id} style={{ display: 'grid', gap: 4 }}>
                            {sl.contentType.startsWith('image/') && !sl.contentType.includes('hei') ? (
                              <a href={`/api/slip/${sl.id}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="slip-img" src={`/api/slip/${sl.id}`} alt={`Slip ${i + 1} from ${m.name}`} loading="lazy" />
                              </a>
                            ) : (
                              <a href={`/api/slip/${sl.id}`} target="_blank" rel="noreferrer">Open slip {i + 1}</a>
                            )}
                            <span className="muted small">
                              Slip {i + 1} · {new Date(sl.uploadedAt).toLocaleString('en-GB')}
                              {sl.reference && <> · Ref: {sl.reference}</>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <form action={receivePayment} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">
                        Total received (Rs.)
                        <span className="hint">All money received from this member so far.</span>
                        <input name="paidAmount" type="number" min="0" step="any" inputMode="decimal"
                          defaultValue={m.payment.status === 'submitted' ? suggested : p.paid || ''} />
                      </label>
                      <label className="field">Note to member <span className="hint">Optional</span><input name="adminNote" type="text" defaultValue={m.payment.adminNote} /></label>
                      <button className="btn sm" formAction={receivePayment}>Save received</button>
                      <button className="btn sm danger" formAction={rejectSlip}>Reject slip</button>
                    </form>

                    <form action={setAmountOverride} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">
                        Custom full price (Rs.) <span className="hint">Calculated: {rs(calculatedAmount(m, s))}. Empty = use it.</span>
                        <input name="amount" type="number" min="0" step="any" inputMode="decimal" defaultValue={m.amountOverride ?? ''} />
                      </label>
                      <label className="field">
                        Custom advance (Rs.) <span className="hint">Calculated: {rs(calculatedAdvance(m, s))}. Empty = use it.</span>
                        <input name="advance" type="number" min="0" step="any" inputMode="decimal" defaultValue={m.advanceOverride ?? ''} />
                      </label>
                      <button className="btn ghost sm">Save prices</button>
                    </form>

                    <form action={adminEditHeadcount} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">Going?
                        <select name="going" defaultValue={m.going ? 'yes' : 'no'}><option value="yes">Yes</option><option value="no">No</option></select>
                      </label>
                      <label className="field">+ people going<input name="goingGuests" type="number" min="0" max="30" defaultValue={m.goingGuests} /></label>
                      <label className="field">Staying at booked place?
                        <select name="staying" defaultValue={m.staying ? 'yes' : 'no'}><option value="yes">Yes</option><option value="no">No</option></select>
                      </label>
                      <label className="field">Coming back?
                        <select name="returning" defaultValue={m.returning ? 'yes' : 'no'}><option value="yes">Yes</option><option value="no">No</option></select>
                      </label>
                      <label className="field">+ people back<input name="returnGuests" type="number" min="0" max="30" defaultValue={m.returnGuests} /></label>
                      <button className="btn ghost sm">Save headcount</button>
                    </form>

                    <form action={resetPin} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">New PIN for member<input name="pin" type="text" inputMode="numeric" pattern="\d{4,6}" /></label>
                      <button className="btn ghost sm">Reset PIN</button>
                    </form>

                    <form action={deleteMember} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">Remove member <span className="hint">Type DELETE to confirm</span><input name="confirm" type="text" autoComplete="off" /></label>
                      <button className="btn danger sm">Remove</button>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
