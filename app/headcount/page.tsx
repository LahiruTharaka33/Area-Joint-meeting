import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { logout } from '../actions';
import HeadcountForm from './HeadcountForm';

export const dynamic = 'force-dynamic';

export default async function HeadcountPage() {
  const me = await requireMember();
  const { settings: s } = await readDb();
  const firstTime = me.going === null;

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
          <h1>{firstTime ? `Welcome ${me.name.split(' ')[0]}` : 'Change your headcount'}</h1>
          <p style={{ opacity: 0.85 }}>You are counted already. Just tell us who is coming with you.</p>
        </div>
      </header>

      <main className="wrap">
        <section className="card" aria-labelledby="hc">
          <h2 id="hc">Your headcount</h2>
          <HeadcountForm
            initial={{ going: me.going, goingGuests: me.goingGuests, returning: me.returning, returnGuests: me.returnGuests }}
            goingLabel={s.goingLabel}
            stayLabel={s.stayLabel}
            returnLabel={s.returnLabel}
            locked={s.headcountLocked}
          />
          {!firstTime && <Link href="/dashboard" className="btn ghost block">Back to my dashboard</Link>}
        </section>
      </main>
    </>
  );
}
