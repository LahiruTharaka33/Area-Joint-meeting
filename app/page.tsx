import { redirect } from 'next/navigation';
import { currentMember } from '@/lib/auth';
import { readDb } from '@/lib/db';
import AuthForms from './AuthForms';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (await currentMember()) redirect('/dashboard');
  const { settings: s } = await readDb();

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <span className="eyebrow">Headcount &amp; payments</span>
          <h1>{s.eventName}</h1>
          <div className="trip-dates">
            <span>Going · {s.goingLabel}</span>
            <span>Stay · {s.stayLabel}</span>
            <span>Coming back · {s.returnLabel}</span>
          </div>
        </div>
      </header>
      <main className="wrap">
        <div className="card">
          <p className="muted">
            Register once with your phone number and a PIN. Then tell us how many people are coming with you.
            You can come back later with the same phone number and PIN to see how much to pay and upload your bank slip.
          </p>
          <AuthForms />
        </div>
      </main>
    </>
  );
}
