'use client';

import { useActionState, useState } from 'react';
import { saveHeadcount } from '../actions';

type Props = {
  initial: { going: boolean | null; goingGuests: number; returning: boolean | null; returnGuests: number };
  goingLabel: string;
  stayLabel: string;
  returnLabel: string;
  locked: boolean;
};

const yn = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');

function Stepper({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="One less" disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="One more" disabled={disabled || value >= 30} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function YesNo({ name, value, onChange, disabled }: { name: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="choices">
      {(['yes', 'no'] as const).map(v => (
        <label className="choice" key={v}>
          <input type="radio" name={name} value={v} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
          <span>{v === 'yes' ? 'Yes' : 'No'}</span>
        </label>
      ))}
    </div>
  );
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export default function HeadcountForm({ initial, goingLabel, stayLabel, returnLabel, locked }: Props) {
  const [state, action, pending] = useActionState(saveHeadcount, undefined);
  const [going, setGoing] = useState(yn(initial.going));
  const [goingGuests, setGoingGuests] = useState(initial.goingGuests);
  const [returning, setReturning] = useState(yn(initial.returning));
  const [sameAsGoing, setSameAsGoing] = useState(
    initial.returning === null || !initial.going || initial.returnGuests === initial.goingGuests,
  );
  const [returnGuests, setReturnGuests] = useState(initial.returnGuests);

  const effectiveReturnGuests = going === 'yes' && sameAsGoing ? goingGuests : returnGuests;

  return (
    <form action={action} style={{ display: 'grid', gap: 14 }}>
      <input type="hidden" name="goingGuests" value={goingGuests} />
      <input type="hidden" name="returnGuests" value={effectiveReturnGuests} />

      <div className="q">
        <div className="q-title">Are you going on the {goingLabel}?</div>
        <YesNo name="going" value={going} onChange={setGoing} disabled={locked} />
        {going === 'yes' && (
          <>
            <div>
              <div style={{ fontWeight: 600 }}>How many people are coming with you?</div>
              <div className="muted small">Family, friends or anyone else. Don&apos;t count yourself, you are already counted.</div>
            </div>
            <Stepper value={goingGuests} onChange={setGoingGuests} disabled={locked} />
            <div className="total-line">
              <span>Going: you + {goingGuests}</span>
              <span>{people(1 + goingGuests)}</span>
            </div>
            <p className="muted small">The same {people(1 + goingGuests)} will be counted for the {stayLabel}.</p>
          </>
        )}
      </div>

      <div className="q">
        <div className="q-title">Are you coming back on the {returnLabel}?</div>
        <YesNo name="returning" value={returning} onChange={setReturning} disabled={locked} />
        {returning === 'yes' && (
          <>
            {going === 'yes' && (
              <label className="check">
                <input type="checkbox" checked={sameAsGoing} disabled={locked} onChange={e => setSameAsGoing(e.target.checked)} />
                Same people as going ({people(1 + goingGuests)})
              </label>
            )}
            {(going !== 'yes' || !sameAsGoing) && (
              <>
                <div>
                  <div style={{ fontWeight: 600 }}>How many people are coming back with you?</div>
                  <div className="muted small">Don&apos;t count yourself.</div>
                </div>
                <Stepper value={returnGuests} onChange={setReturnGuests} disabled={locked} />
              </>
            )}
            <div className="total-line">
              <span>Coming back: you + {effectiveReturnGuests}</span>
              <span>{people(1 + effectiveReturnGuests)}</span>
            </div>
          </>
        )}
      </div>

      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok" role="status">{state.ok}</div>}
      {locked ? (
        <div className="alert info">The headcount is closed. Contact the organiser if something needs to change.</div>
      ) : (
        <button className="btn cta block" disabled={pending}>{pending ? 'Saving…' : 'Save and go to my dashboard'}</button>
      )}
    </form>
  );
}
