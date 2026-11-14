import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import AdminLoginForm from './AdminLoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLogin() {
  if (await isAdmin()) redirect('/admin');
  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <span className="eyebrow">Organiser</span>
          <h1>Organiser log in</h1>
        </div>
      </header>
      <main className="wrap">
        <div className="card">
          <AdminLoginForm />
        </div>
      </main>
    </>
  );
}
