'use client';

import { useActionState, useState } from 'react';
import { login, register } from './actions';

export default function AuthForms() {
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [regState, regAction, regPending] = useActionState(register, undefined);
  const [logState, logAction, logPending] = useActionState(login, undefined);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'register'} onClick={() => setTab('register')}>
          Register
        </button>
        <button type="button" role="tab" aria-selected={tab === 'login'} onClick={() => setTab('login')}>
          Log in
        </button>
      </div>

      {tab === 'register' ? (
        <form action={regAction} style={{ display: 'grid', gap: 14 }}>
          <label className="field">
            Your name
            <input id="reg-name" name="name" type="text" autoComplete="name" required />
          </label>
          <label className="field">
            Phone / WhatsApp number
            <input id="reg-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07X XXX XXXX" required />
          </label>
          <label className="field">
            Your club / branch
            <input id="reg-club" name="club" type="text" required />
          </label>
          <div className="row">
            <label className="field">
              Choose a PIN
              <span className="hint">4 to 6 digits. You need it to log in again.</span>
              <input id="reg-pin" name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" autoComplete="new-password" required />
            </label>
            <label className="field">
              Type the PIN again
              <span className="hint">&nbsp;</span>
              <input id="reg-pin2" name="pin2" type="password" inputMode="numeric" pattern="\d{4,6}" autoComplete="new-password" required />
            </label>
          </div>
          {regState?.error && <div className="alert error" role="alert">{regState.error}</div>}
          <button className="btn cta block" disabled={regPending}>{regPending ? 'Registering…' : 'Register'}</button>
        </form>
      ) : (
        <form action={logAction} style={{ display: 'grid', gap: 14 }}>
          <label className="field">
            Phone number
            <input id="log-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
          </label>
          <label className="field">
            PIN
            <input id="log-pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" required />
          </label>
          {logState?.error && <div className="alert error" role="alert">{logState.error}</div>}
          <button className="btn block" disabled={logPending}>{logPending ? 'Logging in…' : 'Log in'}</button>
        </form>
      )}
    </div>
  );
}
