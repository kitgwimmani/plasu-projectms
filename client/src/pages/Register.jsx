import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Field, useCatalog } from '../components/ui.jsx';
import { AuthShell } from './Login.jsx';

export default function Register() {
  const cat = useCatalog();
  const [f, setF] = useState({ role: 'student', title: '', name: '', email: '', phone: '', password: '', confirm: '', faculty_id: '', department_id: '', program_id: '', matric_no: '', staff_id: '', research_interests: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'faculty_id' ? { department_id: '', program_id: '' } : k === 'department_id' ? { program_id: '' } : {}) });

  const depts = cat.departments.filter((d) => String(d.faculty_id) === String(f.faculty_id));
  const progs = cat.programs.filter((p) => String(p.department_id) === String(f.department_id));

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (f.password !== f.confirm) return setError('Passwords do not match');
    setBusy(true);
    try { setDone((await api.post('/auth/register', f)).message); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (done) return (
    <AuthShell><h2>Request submitted ✅</h2><p>{done}</p><p className="muted">You will be able to sign in once approved.</p><Link className="btn" to="/login">Back to sign in</Link></AuthShell>
  );
  if (cat.registrationOpen === false) return <AuthShell><h2>Registration closed</h2><p>Self-registration is currently disabled. Contact your department.</p><Link to="/login">Back to sign in</Link></AuthShell>;

  return (
    <AuthShell wide>
      <h2>Request an account</h2>
      <p className="muted">Your Head of Department will verify and approve your registration.</p>
      <div className="seg" role="radiogroup" aria-label="I am a">
        {['student', 'lecturer'].map((r) => (
          <button type="button" key={r} className={f.role === r ? 'active' : ''} onClick={() => setF({ ...f, role: r })}>{r === 'student' ? 'Student (UG / PG)' : 'Lecturer / Staff'}</button>
        ))}
      </div>
      <form onSubmit={submit} className="grid2">
        {f.role === 'lecturer' && (
          <Field label="Title"><select value={f.title} onChange={set('title')}><option value="">—</option>{['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        )}
        <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Faculty"><select value={f.faculty_id} onChange={set('faculty_id')} required><option value="">Select faculty</option>{cat.faculties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Department"><select value={f.department_id} onChange={set('department_id')} required disabled={!f.faculty_id}><option value="">Select department</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        {f.role === 'student' ? (<>
          <Field label="Programme" hint="Determines undergraduate or postgraduate workflow"><select value={f.program_id} onChange={set('program_id')} required disabled={!f.department_id}><option value="">Select programme</option>{progs.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.level === 'PG' ? 'Postgraduate' : 'Undergraduate'})</option>)}</select></Field>
          <Field label="Matric / Reg. number"><input value={f.matric_no} onChange={set('matric_no')} required placeholder="PLASU/2022/CSC/0001" /></Field>
        </>) : (<>
          <Field label="Staff ID"><input value={f.staff_id} onChange={set('staff_id')} required /></Field>
          <Field label="Research interests" hint="Comma separated — used for supervisor matching"><input value={f.research_interests} onChange={set('research_interests')} /></Field>
        </>)}
        <Field label="Password" hint="At least 8 characters"><input type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></Field>
        <Field label="Confirm password"><input type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" /></Field>
        <div className="span2"><ErrorBox>{error}</ErrorBox></div>
        <div className="span2 row between"><Link to="/login">I already have an account</Link><button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit registration'}</button></div>
      </form>
    </AuthShell>
  );
}
