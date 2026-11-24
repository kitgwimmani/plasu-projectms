import { useState } from 'react';
import { api } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, Tabs, timeAgo, toast, toastErr, useCatalog, useFetch, useTableControls } from '../components/ui.jsx';

const TABS = [
  { key: 'admins', label: 'Administrators' }, { key: 'staff', label: 'Academic staff' }, { key: 'student', label: 'Students' }, { key: 'pending', label: 'Pending' },
  { key: 'all', label: 'Everyone' }, { key: 'deactivated', label: 'Deactivated' },
];
const canManageRole = (me, role) => me.role === 'superadmin' || (me.role === 'sysadmin' && !['superadmin', 'sysadmin'].includes(role));

export default function Users() {
  const { user } = useAuth();
  const isAdm = ['superadmin', 'sysadmin'].includes(user.role);
  const [tab, setTab] = useState(isAdm ? 'admins' : 'staff');
  const [edit, setEdit] = useState(null);
  const [deact, setDeact] = useState(null);
  const params = new URLSearchParams();
  if (tab === 'admins') params.set('role', 'admins');
  if (tab === 'student') params.set('role', 'student');
  if (tab === 'pending') params.set('status', 'pending');
  if (tab === 'deactivated') params.set('status', 'deactivated');
  const { data, loading, reload } = useFetch(`/admin/users?${params}`);
  const base = (data || []).filter((u) => tab !== 'staff' || ['lecturer', 'hod', 'dean'].includes(u.role));
  const t = useTableControls(base, {
    placeholder: 'Search name, email, matric/staff ID, phone…',
    search: ['name', 'email', 'matric_no', 'staff_id', 'phone', 'title', 'department_name', 'faculty_name', 'program_name', 'research_interests'],
    filters: [
      { key: 'role', label: 'Role', get: (u) => u.role, format: (v) => ROLE_LABEL[v] || v },
      { key: 'status', label: 'Status', get: (u) => u.status },
      { key: 'faculty', label: 'Faculty', get: (u) => u.faculty_name },
      { key: 'dept', label: 'Department', get: (u) => u.department_name },
      { key: 'program', label: 'Programme', get: (u) => u.program_name },
      { key: 'level', label: 'Level', get: (u) => u.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate'), noneLabel: '— Not a student —' },
      { key: 'joined', label: 'Joined', type: 'date', get: (u) => u.created_at },
    ],
  });
  const rows = t.rows;

  return (
    <div>
      <PageHead title={isAdm ? 'Users & Administrators' : 'People'} sub={user.role === 'superadmin' ? 'Create and manage system administrators, deans, HODs, staff and students' : isAdm ? 'Manage staff and student accounts' : 'Staff and students in your unit'}>
        {isAdm && <button className="btn" onClick={() => setEdit({})}>+ New user</button>}
      </PageHead>
      <Tabs tabs={TABS.filter((x) => isAdm || x.key !== 'admins')} value={tab} onChange={setTab} />
      <div className="card">
        <TableControls {...t} />
        {loading ? <Loading /> : !rows.length ? <Empty>{t.total ? 'No users match your search or filters.' : 'No users found.'}</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Unit</th><th>ID</th><th>Status</th><th>Last login</th>{isAdm && <th />}</tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.title} {u.name}</strong><br /><small className="muted">{u.email}</small></td>
                <td><Badge tone={['superadmin', 'sysadmin'].includes(u.role) ? 'serious' : ['dean', 'hod'].includes(u.role) ? 'info' : 'muted'}>{ROLE_LABEL[u.role]}</Badge>{u.level && <small className="muted"> {u.level}</small>}</td>
                <td><small>{u.department_name || u.faculty_name || '—'}{u.program_name && <><br /><span className="muted">{u.program_name}</span></>}</small></td>
                <td><small>{u.matric_no || u.staff_id || '—'}</small></td>
                <td><Badge>{u.status}</Badge></td>
                <td><small>{u.last_login ? timeAgo(u.last_login) : 'never'}</small></td>
                {isAdm && <td className="nowrap">
                  {canManageRole(user, u.role) && <button className="btn ghost sm" onClick={() => setEdit(u)}>Edit</button>}
                  {canManageRole(user, u.role) && u.id !== user.id && (u.status === 'deactivated'
                    ? <> <button className="btn sm" onClick={async () => { try { await api.post(`/admin/users/${u.id}/reactivate`); toast(`${u.name} reactivated`); reload(); } catch (e) { toastErr(e); } }}>Reactivate</button></>
                    : <> <button className="btn ghost sm danger" onClick={() => setDeact({ u })}>Deactivate</button></>)}
                </td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination {...t} />
      </div>
      {edit && <UserModal u={edit} me={user} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {deact && <Confirm danger yes={deact.warning ? 'Deactivate and hand over students' : 'Deactivate'}
        text={deact.warning || `Deactivate ${deact.u.name}? They will no longer be able to sign in, and any Dean/HOD office they hold becomes vacant. All their records are kept and the account can be reactivated at any time.`}
        onClose={() => setDeact(null)}
        onYes={async () => {
          try {
            const r = await api.post(`/admin/users/${deact.u.id}/deactivate`, { force: !!deact.warning });
            toast(`${deact.u.name} deactivated${r.reassigned ? ` — ${r.reassigned} student(s) handed over` : ''}`); reload();
          } catch (e) {
            if (/supervises/.test(e.message)) setTimeout(() => setDeact({ u: deact.u, warning: e.message }), 0); else toastErr(e);
          }
        }} />}
    </div>
  );
}

function UserModal({ u, me, onClose, onSaved }) {
  const cat = useCatalog();
  const isNew = !u.id;
  const [f, setF] = useState({ name: u.name || '', email: u.email || '', role: u.role || 'lecturer', status: u.status || 'active', title: u.title || '', phone: u.phone || '',
    faculty_id: u.faculty_id || '', department_id: u.department_id || '', program_id: u.program_id || '', matric_no: u.matric_no || '', staff_id: u.staff_id || '', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const roles = me.role === 'superadmin' ? Object.keys(ROLE_LABEL) : ['dean', 'hod', 'lecturer', 'student'];
  const depts = cat.departments.filter((d) => !f.faculty_id || String(d.faculty_id) === String(f.faculty_id));
  const progs = cat.programs.filter((p) => String(p.department_id) === String(f.department_id));
  const save = async () => {
    try {
      const body = { ...f }; if (!body.password) delete body.password;
      if (isNew) await api.post('/admin/users', body); else await api.put(`/admin/users/${u.id}`, body);
      toast(isNew ? 'User created' : 'User updated'); onSaved();
    } catch (e) { toastErr(e); }
  };
  return (
    <Modal title={isNew ? 'New user' : `Edit ${u.name}`} onClose={onClose} wide>
      <div className="grid2">
        <Field label="Title"><select value={f.title} onChange={set('title')}><option value="">—</option>{['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Full name"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Role" hint={f.role === 'dean' ? 'Becomes dean of the selected faculty' : f.role === 'hod' ? 'Becomes HOD of the selected department' : ''}><select value={f.role} onChange={set('role')} disabled={u.id === me.id}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        <Field label="Status"><select value={f.status} onChange={set('status')} disabled={u.id === me.id || f.status === 'deactivated'}>{(f.status === 'deactivated' ? ['deactivated'] : ['active', 'pending', 'suspended', 'rejected']).map((s) => <option key={s}>{s}</option>)}</select></Field>
        {!['superadmin', 'sysadmin'].includes(f.role) && (<>
          <Field label="Faculty"><select value={f.faculty_id} onChange={(e) => setF({ ...f, faculty_id: e.target.value, department_id: '', program_id: '' })}><option value="">—</option>{cat.faculties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          {f.role !== 'dean' && <Field label="Department"><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value, program_id: '' })}><option value="">—</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        </>)}
        {f.role === 'student' ? (<>
          <Field label="Programme"><select value={f.program_id} onChange={set('program_id')}><option value="">—</option>{progs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Matric number"><input value={f.matric_no} onChange={set('matric_no')} /></Field>
        </>) : <Field label="Staff ID"><input value={f.staff_id} onChange={set('staff_id')} /></Field>}
        <Field label={isNew ? 'Initial password' : 'Reset password'} hint={isNew ? 'Share securely; the user can change it in Profile' : 'Leave blank to keep the current password'}><input type="text" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
      </div>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{isNew ? 'Create user' : 'Save changes'}</button></div>
    </Modal>
  );
}
