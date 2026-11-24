import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

const DEMO = [
  ['Super Admin', 'superadmin@plasu.edu.ng', 'Admin@123'],
  ['System Admin', 'sysadmin@plasu.edu.ng', 'Password@123'],
  ['Dean (FNAS)', 'dean.fnas@plasu.edu.ng', 'Password@123'],
  ['HOD (Comp. Sci.)', 'hod.csc@plasu.edu.ng', 'Password@123'],
  ['Lecturer', 'd.bulus@plasu.edu.ng', 'Password@123'],
  ['Student (UG)', 'amina.musa@student.plasu.edu.ng', 'Password@123'],
  ['Student (PG)', 'ibrahim.yusuf@student.plasu.edu.ng', 'Password@123'],
];

export function AuthShell({ children, wide }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src="/logo.png" alt="Plateau State University logo" />
        <h1>Plateau State University, Bokkos</h1>
        <p className="motto">Knowledge · Diligence · Integrity</p>
        <h2>Project Management System</h2>
        <ul>
          <li>Topic approval, chapter reviews and progress tracking</li>
          <li>Writing studio with plagiarism & AI-writing checks</li>
          <li>Supervisor chat, notifications and defense scheduling</li>
          <li>Templates, referencing support and publication tools</li>
        </ul>
      </div>
      <div className={`auth-card ${wide ? 'wide' : ''}`}>{children}</div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await login(email, password); nav('/'); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <AuthShell>
      <h2>Sign in</h2>
      <p className="muted">Use your university email address.</p>
      <form onSubmit={submit} className="stack">
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="center">New student or staff? <Link to="/register">Request an account</Link></p>
      <details className="demo">
        <summary>Demo accounts</summary>
        <div className="demo-grid">
          {DEMO.map(([label, em, pw]) => (
            <button key={em} type="button" className="chip" onClick={() => { setEmail(em); setPassword(pw); }}>{label}</button>
          ))}
        </div>
      </details>
    </AuthShell>
  );
}
