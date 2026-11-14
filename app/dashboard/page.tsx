import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { amountDue, breakdown, groupSizes, rs } from '@/lib/calc';
import { logout } from '../actions';
import SlipUpload from './SlipUpload';
import CopyButton from './CopyButton';

export const dynamic = 'force-dynamic';

const STATUS_TEXT = {
  none: 'Not paid yet. Pay to the account below and upload your slip.',
  submitted: 'Slip received. Waiting for the organiser to check it.',
  verified: 'Payment confirmed. Thank you!',
  rejected: 'Your slip was not accepted. Please check and upload again.',
} as const;
const STATUS_PILL = { none: 'Not paid', submitted: 'Checking', verified: 'Paid', rejected: 'Not accepted' } as const;

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireMember();
  if (me.going === null) redirect('/headcount');
  const { saved } = await searchParams;
  const { settings: s } = await readDb();
  const g = groupSizes(me);
  const due = amountDue(me, s);
  const lines = breakdown(me, s);
  const bank = s.bank;
  const bankRows = [
    ['Account name', bank.accountName],
    ['Bank', bank.bankName],
    ['Branch', bank.branch],
    ['Account number', bank.accountNumber],
  ].filter(([, v]) => v);
  const paymentReady = due > 0;

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
                <td>Same as going</td>
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
            {paymentReady && <span className={`pill ${me.payment.status}`}>{STATUS_PILL[me.payment.status]}</span>}
          </div>

          {!paymentReady ? (
            <p className="muted">
              The organiser will add the amount to pay and the bank details here after taking the full headcount.
              Please check back later.
            </p>
          ) : (
            <>
              <div>
                <div className="muted small">Amount to pay</div>
                <div className="amount">{rs(due)}</div>
              </div>

              {me.amountOverride === null && lines.length > 0 && (
                <table className="lines">
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
              )}
              {me.amountOverride !== null && <p className="muted small">Amount set by the organiser.</p>}

              <div className={`alert ${me.payment.status === 'verified' ? 'ok' : me.payment.status === 'rejected' ? 'error' : 'info'}`}>
                {STATUS_TEXT[me.payment.status]}
                {me.payment.adminNote && <><br />Note from organiser: {me.payment.adminNote}</>}
              </div>

              {me.payment.status !== 'verified' && (
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
                  <SlipUpload again={me.payment.status !== 'none'} />
                </>
              )}

              {me.payment.hasSlip && (
                <p className="small">
                  <a href={`/api/slip/${me.id}`} target="_blank" rel="noreferrer">View the slip you uploaded</a>
                  {me.payment.uploadedAt && <span className="muted"> · {new Date(me.payment.uploadedAt).toLocaleString('en-GB')}</span>}
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
