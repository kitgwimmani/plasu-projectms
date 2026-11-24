import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Field, PageHead, toast, toastErr } from '../components/ui.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user.name, title: user.title || '', phone: user.phone || '', research_interests: user.research_interests || '', bio: user.bio || '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const save = async () => { try { setUser((await api.put('/auth/me', f)).user); toast('Profile updated'); } catch (e) { toastErr(e); } };
  const changePw = async () => {
    if (pw.next !== pw.confirm) return toastErr('New passwords do not match');
    try { await api.post('/auth/me/password', pw); setPw({ current: '', next: '', confirm: '' }); toast('Password changed'); } catch (e) { toastErr(e); }
  };
  return (
    <div>
      <PageHead title="My Profile" sub={`${ROLE_LABEL[user.role]}${user.department_name ? ` · ${user.department_name}` : ''}${user.faculty_name ? ` · ${user.faculty_name}` : ''}`} />
      <div className="grid2">
        <div className="card stack">
          <h3>Personal details</h3>
          <div className="grid2">
            <Field label="Title"><select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}><option value="">—</option>{['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email" hint="Contact an administrator to change"><input value={user.email} disabled /></Field>
            <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            {user.matric_no && <Field label="Matric number"><input value={user.matric_no} disabled /></Field>}
            {user.program_name && <Field label="Programme"><input value={user.program_name} disabled /></Field>}
            {user.staff_id && <Field label="Staff ID"><input value={user.staff_id} disabled /></Field>}
          </div>
          <Field label="Research interests" hint="Comma separated — shown in the directory and used for supervisor matching"><input value={f.research_interests} onChange={(e) => setF({ ...f, research_interests: e.target.value })} /></Field>
          <Field label="Short bio"><textarea rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
          <div className="row end"><button className="btn" onClick={save}>Save profile</button></div>
        </div>
        <div className="card stack">
          <h3>Change password</h3>
          <Field label="Current password"><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <div className="row end"><button className="btn" onClick={changePw}>Update password</button></div>
        </div>
      </div>
    </div>
  );
}
