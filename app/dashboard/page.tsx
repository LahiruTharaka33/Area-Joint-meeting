import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { breakdown, groupSizes, paySummary, PAY_STATE_LABEL, rs } from '@/lib/calc';
import { logout } from '../actions';
import SlipUpload from './SlipUpload';
import CopyButton from './CopyButton';

export const dynamic = 'force-dynamic';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireMember();
  if (me.going === null) redirect('/headcount');
  const { saved } = await searchParams;
  const s = await getSettings();
  const g = groupSizes(me);
  const pay = paySummary(me, s);
  const lines = breakdown(me, s);
  const bank = s.bank;
  const bankRows = [
    ['Account name', bank.accountName],
    ['Bank', bank.bankName],
    ['Branch', bank.branch],
    ['Account number', bank.accountNumber],
  ].filter(([, v]) => v);
  const waiting = me.payment.status === 'submitted';
  const rejected = me.payment.status === 'rejected';
  const nextIsAdvance = pay.advance > 0 && pay.paid < pay.advance;

  const pill = waiting ? ['submitted', 'Checking'] : rejected ? ['rejected', 'Not accepted']
    : pay.state === 'full' ? ['verified', 'Fully paid']
    : pay.state === 'advance' ? ['verified', 'Advance paid']
    : ['none', PAY_STATE_LABEL[pay.state]];

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-top">
            <span className="eyebrow">{s.eventName}</span>
            <form action={logout}>
              <button className="btn light sm">Log out</button>
            </form>
          </div>
          <h1>Hi {me.name.split(' ')[0]}</h1>
          <p style={{ opacity: 0.85 }}>{me.club} · {me.phone}</p>
        </div>
      </header>

      <main className="wrap">
        {saved && <div className="alert ok" role="status">Your headcount is saved.</div>}

        <section className="card" aria-labelledby="hc">
          <div className="card-head">
            <h2 id="hc">Your headcount</h2>
            {!s.headcountLocked && <Link href="/headcount" className="btn ghost sm">Edit</Link>}
          </div>
          <table className="lines">
            <tbody>
              <tr>
                <td>{s.goingLabel}</td>
                <td>{me.going ? `You + ${me.goingGuests}` : 'Not going'}</td>
                <td><strong>{people(g.going)}</strong></td>
              </tr>
              <tr>
                <td>{s.stayLabel}</td>
                <td>{!me.going ? '–' : me.staying ? 'At the booked place' : 'Staying elsewhere'}</td>
                <td><strong>{people(g.stay)}</strong></td>
              </tr>
              <tr>
                <td>{s.returnLabel}</td>
                <td>{me.returning ? `You + ${me.returnGuests}` : 'Not coming back'}</td>
                <td><strong>{people(g.ret)}</strong></td>
              </tr>
            </tbody>
          </table>
          {s.headcountLocked && <p className="muted small">The headcount is closed. Contact the organiser if something needs to change.</p>}
        </section>

        <section className="card" aria-labelledby="pay">
          <div className="card-head">
            <h2 id="pay">Payment details</h2>
            {pay.full > 0 && <span className={`pill ${pill[0]}`}>{pill[1]}</span>}
          </div>

          {pay.full <= 0 ? (
            <p className="muted">
              The organiser will add the price and the bank details here after taking the full headcount.
              Please check back later.
            </p>
          ) : (
            <>
              <div className="money">
                <div className="money-row">
                  <span className="lbl">Full price</span>
                  <span className="val">{rs(pay.full)}</span>
                </div>
                {pay.advance > 0 && pay.advance < pay.full && (
                  <div className="money-row">
                    <span className="lbl">Advance to confirm your seats</span>
                    <span className="val">{rs(pay.advance)}</span>
                  </div>
                )}
                {pay.paid > 0 && (
                  <div className="money-row">
                    <span className="lbl">Paid so far</span>
                    <span className="val">{rs(pay.paid)}</span>
                  </div>
                )}
                <div className="money-row">
                  <span className="lbl">Balance</span>
                  <span className="val">{rs(pay.balance)}</span>
                </div>
                {pay.payNow > 0 && (
                  <div className="money-row now">
                    <span className="lbl">{nextIsAdvance ? 'Pay now (advance)' : 'Pay the balance'}</span>
                    <span className="val">{rs(pay.payNow)}</span>
                  </div>
                )}
              </div>

              {me.amountOverride === null && lines.length > 0 && (
                <details>
                  <summary className="muted small" style={{ cursor: 'pointer' }}>How the full price is worked out</summary>
                  <table className="lines" style={{ marginTop: 8 }}>
                    <tbody>
                      {lines.map(l => (
                        <tr key={l.label}>
                          <td>{l.label}</td>
                          <td>{l.people} × {rs(l.rate)}</td>
                          <td>{rs(l.people * l.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              {me.amountOverride !== null && <p className="muted small">Price set by the organiser for your group.</p>}

              <div className={`alert ${pay.state === 'full' ? 'ok' : rejected ? 'error' : 'info'}`}>
                {waiting
                  ? 'Slip received. Waiting for the organiser to check it.'
                  : rejected
                    ? 'Your last slip was not accepted. Please check and upload again.'
                    : pay.state === 'full'
                      ? 'Fully paid. Thank you!'
                      : pay.state === 'advance'
                        ? `Advance received. Please pay the balance of ${rs(pay.balance)} before the trip.`
                        : nextIsAdvance
                          ? `Pay the advance of ${rs(pay.payNow)} to confirm your seats. The balance can be paid later.`
                          : `Please pay ${rs(pay.payNow)}.`}
                {me.payment.adminNote && <><br />Note from organiser: {me.payment.adminNote}</>}
              </div>

              {pay.balance > 0 && (
                <>
                  <h3>Pay to this account</h3>
                  {bankRows.length === 0 ? (
                    <p className="muted">The organiser will add the bank details soon.</p>
                  ) : (
                    <div className="bank">
                      {bankRows.map(([k, v]) => (
                        <div className="bank-row" key={k}>
                          <div style={{ minWidth: 0 }}>
                            <div className="k">{k}</div>
                            <div className="v">{v}</div>
                          </div>
                          {k === 'Account number' && <CopyButton text={v.replace(/\s/g, '')} />}
                        </div>
                      ))}
                      {bank.note && <p className="muted small">{bank.note}</p>}
                    </div>
                  )}
                  <SlipUpload again={me.payment.slips.length > 0} />
                </>
              )}

              {me.payment.slips.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <h3>Your slips</h3>
                  <ul className="slip-list small">
                    {me.payment.slips.map((sl, i) => (
                      <li key={sl.id}>
                        <a href={`/api/slip/${sl.id}`} target="_blank" rel="noreferrer">Slip {i + 1}</a>
                        <span className="muted"> · {new Date(sl.uploadedAt).toLocaleString('en-GB')}{sl.reference && ` · ${sl.reference}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
