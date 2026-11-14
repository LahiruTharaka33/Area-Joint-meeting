'use client';

import { useActionState } from 'react';
import { adminLogin } from '../../actions';

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 14 }}>
      <label className="field">
        Organiser password
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      <button className="btn block" disabled={pending}>{pending ? 'Checking…' : 'Log in'}</button>
    </form>
  );
}
