import type { Member, Settings } from '@/lib/db';
import { rs } from '@/lib/calc';

/* ---------- numbers ---------- */

export function headcountStats(members: Member[]) {
  const answered = members.filter(m => m.going !== null);
  const trip = () => ({ members: 0, family: 0 });
  const going = trip(), stay = trip(), ret = trip(), everyone = trip();
  let notGoing = 0;
  for (const m of answered) {
    if (m.going) {
      going.members++;
      going.family += m.goingGuests;
      if (m.staying) {
        stay.members++;
        stay.family += m.goingGuests;
      }
    } else notGoing++;
    if (m.returning) {
      ret.members++;
      ret.family += m.returnGuests;
    }
    if (m.going || m.returning) {
      everyone.members++;
      everyone.family += Math.max(m.going ? m.goingGuests : 0, m.returning ? m.returnGuests : 0);
    }
  }
  const withFamily = answered
    .filter(m => (m.going && m.goingGuests > 0) || (m.returning && m.returnGuests > 0))
    .map(m => ({
      m,
      extra: Math.max(m.going ? m.goingGuests : 0, m.returning ? m.returnGuests : 0),
    }))
    .sort((a, b) => b.extra - a.extra || a.m.name.localeCompare(b.m.name));

  return {
    registered: members.length,
    answered: answered.length,
    noAnswer: members.length - answered.length,
    goingYes: going.members,
    notGoing,
    going, stay, ret, everyone,
    withFamily,
  };
}

/* ---------- charts (plain SVG / HTML, no library) ---------- */

type Slice = { label: string; value: number; color: string };

function Donut({ slices, center, centerLabel, title }: { slices: Slice[]; center: number; centerLabel: string; title: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 52;
  const C = 2 * Math.PI * r;
  const gap = total > 0 && slices.filter(s => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`${title}: ${slices.map(s => `${s.label} ${s.value}`).join(', ')}`}>
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--chart-empty)" strokeWidth="18" />
          {total > 0 && slices.map(s => {
            if (s.value <= 0) return null;
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.label}
                cx="70" cy="70" r={r} fill="none"
                stroke={s.color} strokeWidth="18"
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
                className="donut-seg"
              >
                <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
          <text x="70" y="68" textAnchor="middle" className="donut-num">{center}</text>
          <text x="70" y="86" textAnchor="middle" className="donut-lbl">{centerLabel}</text>
        </svg>
        <ul className="legend">
          {slices.map(s => (
            <li key={s.label}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="legend-label">{s.label}</span>
              <span className="legend-val">
                {s.value}
                {total > 0 && <span className="muted"> · {Math.round((s.value / total) * 100)}%</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function TripBars({ rows }: { rows: { label: string; members: number; family: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.members + r.family));
  return (
    <figure className="chart chart-wide">
      <figcaption className="chart-title">People per trip</figcaption>
      <ul className="legend legend-row">
        <li><span className="swatch" style={{ background: 'var(--series-1)' }} /><span className="legend-label">Members</span></li>
        <li><span className="swatch" style={{ background: 'var(--series-2)' }} /><span className="legend-label">Family &amp; others</span></li>
      </ul>
      <div className="bars">
        {rows.map(r => {
          const total = r.members + r.family;
          return (
            <div className="bar-row" key={r.label}>
              <div className="bar-label">{r.label}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(total / max) * 100}%` }}>
                  {r.members > 0 && (
                    <div className="seg" style={{ flexGrow: r.members, background: 'var(--series-1)' }}
                      title={`${r.label} · Members: ${r.members}`} />
                  )}
                  {r.family > 0 && (
                    <div className="seg" style={{ flexGrow: r.family, background: 'var(--series-2)' }}
                      title={`${r.label} · Family & others: ${r.family}`} />
                  )}
                </div>
                <span className="bar-total">{total}</span>
              </div>
              <div className="bar-sub muted small">{r.members} members + {r.family} family &amp; others</div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ---------- section ---------- */

export default function Overview({ members, settings: s, money }: {
  members: Member[];
  settings: Settings;
  money: { received: number; expected: number; toCheck: number };
}) {
  const st = headcountStats(members);
  const rows = [
    { label: s.goingLabel, ...st.going },
    { label: s.stayLabel, ...st.stay },
    { label: s.returnLabel, ...st.ret },
  ];
  const everyoneTotal = st.everyone.members + st.everyone.family;

  return (
    <section className="card overview" aria-labelledby="ov">
      <h2 id="ov">Overview</h2>

      <div className="stats">
        <div className="stat">
          <span className="label">Registered members</span>
          <span className="big">{st.registered}</span>
          <span className="muted">signed up on the site</span>
        </div>
        <div className="stat">
          <span className="label">Answered</span>
          <span className="big">{st.answered}</span>
          <span className="muted">{st.noAnswer} not answered yet</span>
        </div>
        <div className="stat primary">
          <span className="label">Everyone coming</span>
          <span className="big">{everyoneTotal}</span>
          <span className="muted">{st.everyone.members} members + {st.everyone.family} family &amp; others</span>
        </div>
        <div className="stat">
          <span className="label">Money received</span>
          <span className="big" style={{ fontSize: '1.5rem' }}>{rs(money.received)}</span>
          <span className="muted">of {rs(money.expected)} · {money.toCheck} slip{money.toCheck === 1 ? '' : 's'} to check</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="counts summary">
          <thead>
            <tr>
              <th></th>
              <th className="num">Members only</th>
              <th className="num">Family &amp; others</th>
              <th className="num">Total people</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{r.members}</td>
                <td className="num">{r.family}</td>
                <td className="num"><strong>{r.members + r.family}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Everyone coming (any trip)</td>
              <td className="num">{st.everyone.members}</td>
              <td className="num">{st.everyone.family}</td>
              <td className="num">{everyoneTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="charts">
        <Donut
          title="Registered members"
          center={st.registered}
          centerLabel="registered"
          slices={[
            { label: 'Going', value: st.goingYes, color: 'var(--series-1)' },
            { label: 'Answered, not going', value: st.notGoing, color: 'var(--series-3)' },
            { label: 'Not answered yet', value: st.noAnswer, color: 'var(--chart-neutral)' },
          ]}
        />
        <Donut
          title="Everyone coming"
          center={everyoneTotal}
          centerLabel="people"
          slices={[
            { label: 'Members', value: st.everyone.members, color: 'var(--series-1)' },
            { label: 'Family & others', value: st.everyone.family, color: 'var(--series-2)' },
          ]}
        />
        <TripBars rows={rows} />
      </div>

      <div>
        <h3>Members bringing family or others ({st.withFamily.length})</h3>
        {st.withFamily.length === 0 ? (
          <p className="muted small">Nobody has added family or others yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="counts">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Club</th>
                  <th className="num">{s.goingLabel}</th>
                  <th className="num">{s.stayLabel}</th>
                  <th className="num">{s.returnLabel}</th>
                </tr>
              </thead>
              <tbody>
                {st.withFamily.map(({ m }) => (
                  <tr key={m.id}>
                    <td><a href={`#m-${m.id}`}>{m.name}</a><div className="muted small">{m.phone}</div></td>
                    <td>{m.club}</td>
                    <td className="num">{m.going ? `1 + ${m.goingGuests}` : '–'}</td>
                    <td className="num">{m.going && m.staying ? `1 + ${m.goingGuests}` : m.going ? 'elsewhere' : '–'}</td>
                    <td className="num">{m.returning ? `1 + ${m.returnGuests}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
