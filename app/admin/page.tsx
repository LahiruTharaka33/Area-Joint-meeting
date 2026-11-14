import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { readDb, type Member } from '@/lib/db';
import { amountDue, calculatedAmount, groupSizes, rs, totals } from '@/lib/calc';
import {
  adminLogout, saveSettings, setPaymentStatus, setAmountOverride, adminEditHeadcount, resetPin, deleteMember,
} from '../actions';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, [string, string]> = {
  settings: ['ok', 'Settings saved.'],
  payment: ['ok', 'Payment status updated.'],
  amount: ['ok', 'Amount updated.'],
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
  ['unpaid', 'Not paid'],
  ['paid', 'Paid'],
] as const;

const STATUS_LABEL = { none: 'Not paid', submitted: 'Slip to check', verified: 'Paid', rejected: 'Rejected' } as const;

function matches(m: Member, f: string) {
  switch (f) {
    case 'noreply': return m.going === null;
    case 'going': return !!m.going;
    case 'tocheck': return m.payment.status === 'submitted';
    case 'unpaid': return m.payment.status === 'none' || m.payment.status === 'rejected';
    case 'paid': return m.payment.status === 'verified';
    default: return true;
  }
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string; f?: string }> }) {
  await requireAdmin();
  const { msg, f = 'all' } = await searchParams;
  const { settings: s, members } = await readDb();
  const t = totals(members, s);
  const goingTotal = t.going.members + t.going.others;
  const retTotal = t.ret.members + t.ret.others;
  const allSorted = [...members].sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
  const list = allSorted.filter(m => matches(m, f));
  const clubMap = new Map<string, { club: string; members: number; going: number; ret: number }>();
  for (const m of members) {
    const key = m.club.trim() || '—';
    const c = clubMap.get(key.toLowerCase()) ?? { club: key, members: 0, going: 0, ret: 0 };
    const g = groupSizes(m);
    c.members++;
    c.going += g.going;
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

        <section className="stats" aria-label="Totals">
          <div className="stat primary">
            <span className="label">{s.goingLabel}</span>
            <span className="big">{goingTotal}</span>
            <span className="muted">{t.going.members} members + {t.going.others} others</span>
          </div>
          <div className="stat primary">
            <span className="label">{s.stayLabel}</span>
            <span className="big">{goingTotal}</span>
            <span className="muted">Same as going bus</span>
          </div>
          <div className="stat primary">
            <span className="label">{s.returnLabel}</span>
            <span className="big">{retTotal}</span>
            <span className="muted">{t.ret.members} members + {t.ret.others} others</span>
          </div>
          <div className="stat">
            <span className="label">Money</span>
            <span className="big" style={{ fontSize: '1.5rem' }}>{rs(t.verified)}</span>
            <span className="muted">confirmed of {rs(t.expected)} expected · {t.toCheck} slip{t.toCheck === 1 ? '' : 's'} to check</span>
          </div>
        </section>

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
                    <th className="num">Amount</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {allSorted.map(m => {
                    const g = groupSizes(m);
                    return (
                      <tr key={m.id}>
                        <td><a href={`#m-${m.id}`}>{m.name}</a><div className="muted small">{m.phone}</div></td>
                        <td>{m.club}</td>
                        {m.going === null ? (
                          <td colSpan={3} className="muted">No answer yet</td>
                        ) : (
                          <>
                            <td className="num">{g.going}{m.goingGuests > 0 && <span className="muted small"> (1+{m.goingGuests})</span>}</td>
                            <td className="num">{g.stay}</td>
                            <td className="num">{g.ret}{m.returnGuests > 0 && <span className="muted small"> (1+{m.returnGuests})</span>}</td>
                          </>
                        )}
                        <td className="num">{amountDue(m, s) > 0 ? rs(amountDue(m, s)) : '–'}</td>
                        <td><span className={`pill ${m.payment.status}`}>{STATUS_LABEL[m.payment.status]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total ({t.responded} answered)</td>
                    <td className="num">{goingTotal}</td>
                    <td className="num">{goingTotal}</td>
                    <td className="num">{retTotal}</td>
                    <td className="num">{rs(t.expected)}</td>
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
                        <td className="num">{c.going}</td>
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
            When you save a price here, every member who answered sees the amount they have to pay and the bank details on their dashboard.
            Leave the prices empty until you have taken the full count.
          </p>
          <form action={saveSettings} style={{ display: 'grid', gap: 14 }}>
            <h3>Price per person (Rs.)</h3>
            <div className="row">
              <label className="field">Going bus<input id="rateGoing" name="rateGoing" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.going || ''} /></label>
              <label className="field">Stay<input id="rateStay" name="rateStay" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.stay || ''} /></label>
              <label className="field">Coming-back bus<input id="rateReturn" name="rateReturn" type="number" min="0" step="any" inputMode="decimal" defaultValue={s.rates.return || ''} /></label>
            </div>
            <p className="muted small">
              Each member pays: (going people × going price) + (stay people × stay price) + (coming-back people × coming-back price).
              You can set a different amount for any member below.
            </p>
            <h3>Bank details shown to members</h3>
            <div className="row">
              <label className="field">Account name<input id="accountName" name="accountName" type="text" defaultValue={s.bank.accountName} /></label>
              <label className="field">Bank<input id="bankName" name="bankName" type="text" defaultValue={s.bank.bankName} /></label>
              <label className="field">Branch<input id="branch" name="branch" type="text" defaultValue={s.bank.branch} /></label>
              <label className="field">Account number<input id="accountNumber" name="accountNumber" type="text" inputMode="numeric" defaultValue={s.bank.accountNumber} /></label>
            </div>
            <label className="field">Note for members <span className="hint">e.g. &quot;Use your name as the reference. Pay before 1st Dec.&quot;</span>
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
          <p className="muted small">Check slips, mark payments, set a custom amount, change numbers or reset a PIN.</p>
          <nav className="filters" aria-label="Filter members">
            {FILTERS.map(([key, label]) => (
              <Link key={key} href={key === 'all' ? '/admin' : `/admin?f=${key}`} aria-current={f === key ? 'page' : undefined}>
                {label} ({members.filter(m => matches(m, key)).length})
              </Link>
            ))}
          </nav>

          {list.length === 0 && <p className="muted">No members here yet. Share the site link so members can register.</p>}

          <div className="members">
            {list.map(m => {
              const g = groupSizes(m);
              const due = amountDue(m, s);
              return (
                <details className="card member" key={m.id} id={`m-${m.id}`}>
                  <summary>
                    <span className="who">{m.name} <span className="muted small">· {m.club}</span></span>
                    <span className={`pill ${m.payment.status}`}>{STATUS_LABEL[m.payment.status]}</span>
                    <span className="nums">
                      {m.going === null
                        ? 'No answer yet'
                        : `Going ${g.going} · Stay ${g.stay} · Back ${g.ret}`}
                    </span>
                    <span className="nums">{rs(due)}</span>
                  </summary>

                  <div className="member-body">
                    <p className="small">
                      Phone: <strong>{m.phone}</strong>
                      {m.updatedAt && <span className="muted"> · updated {new Date(m.updatedAt).toLocaleString('en-GB')}</span>}
                    </p>

                    {m.payment.hasSlip && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <strong>Slip</strong>
                        {m.payment.slipType?.startsWith('image/') && !m.payment.slipType.includes('hei') ? (
                          <a href={`/api/slip/${m.id}`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="slip-img" src={`/api/slip/${m.id}`} alt={`Bank slip from ${m.name}`} loading="lazy" />
                          </a>
                        ) : (
                          <a href={`/api/slip/${m.id}`} target="_blank" rel="noreferrer">Open slip</a>
                        )}
                        <span className="muted small">
                          Uploaded {m.payment.uploadedAt && new Date(m.payment.uploadedAt).toLocaleString('en-GB')}
                          {m.payment.reference && <> · Ref: {m.payment.reference}</>}
                        </span>
                      </div>
                    )}

                    <form action={setPaymentStatus} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">Note to member <input name="adminNote" type="text" defaultValue={m.payment.adminNote} /></label>
                      <button className="btn sm" name="status" value="verified">Mark paid</button>
                      <button className="btn sm danger" name="status" value="rejected">Reject slip</button>
                      <button className="btn ghost sm" name="status" value="none">Reset</button>
                    </form>

                    <form action={setAmountOverride} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">
                        Amount (Rs.) <span className="hint">Calculated: {rs(calculatedAmount(m, s))}. Leave empty to use it.</span>
                        <input name="amount" type="number" min="0" step="any" inputMode="decimal" defaultValue={m.amountOverride ?? ''} />
                      </label>
                      <button className="btn ghost sm">Set amount</button>
                    </form>

                    <form action={adminEditHeadcount} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="field">Going?
                        <select name="going" defaultValue={m.going ? 'yes' : 'no'}><option value="yes">Yes</option><option value="no">No</option></select>
                      </label>
                      <label className="field">+ people going<input name="goingGuests" type="number" min="0" max="30" defaultValue={m.goingGuests} /></label>
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
