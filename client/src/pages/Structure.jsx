import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Confirm, Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, Tabs, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';

export default function Structure() {
  const { data, loading, reload } = useFetch('/admin/structure');
  const [tab, setTab] = useState('faculties');
  const [edit, setEdit] = useState(null);
  const [head, setHead] = useState(null);
  const [del, setDel] = useState(null);
  const status = { key: 'status', label: 'Status', get: (r) => (r.archived_at ? 'Inactive' : 'Active') };
  const headName = (k) => (r) => r[k] || null;
  const tables = {
    faculties: useTableControls(data?.faculties, {
      placeholder: 'Search faculty, code, dean…', search: ['name', 'code', 'dean_name'], initial: { status: 'Active' },
      filters: [status, { key: 'dean', label: 'Dean', get: headName('dean_name'), noneLabel: '— Not assigned —' }],
    }),
    departments: useTableControls(data?.departments, {
      placeholder: 'Search department, code, HOD, faculty…', search: ['name', 'code', 'hod_name', 'faculty_name'], initial: { status: 'Active' },
      filters: [status, { key: 'faculty', label: 'Faculty', get: (r) => r.faculty_name }, { key: 'hod', label: 'HOD', get: headName('hod_name'), noneLabel: '— Not assigned —' }],
    }),
    programs: useTableControls(data?.programs, {
      placeholder: 'Search programme, degree, department…', search: ['name', 'degree', 'department_name', 'duration'], initial: { status: 'Active' },
      filters: [status, { key: 'dept', label: 'Department', get: (r) => r.department_name }, { key: 'level', label: 'Level', get: (r) => r.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
        { key: 'degree', label: 'Degree', get: (r) => r.degree }, { key: 'duration', label: 'Duration', get: (r) => r.duration }],
    }),
  };
  if (loading || !data) return <Loading />;
  const kind = tab;
  const t = tables[tab];
  const restore = async (row) => { try { await api.post(`/admin/${kind}/${row.id}/restore`); toast(`${row.name} reactivated`); reload(); } catch (e) { toastErr(e); } };
  const stateBtn = (row) => (row.archived_at
    ? <button className="btn sm" onClick={() => restore(row)}>Reactivate</button>
    : <button className="btn ghost sm danger" onClick={() => setDel({ kind, row })}>Deactivate</button>);
  const nameCell = (row) => <><strong>{row.name}</strong>{row.archived_at && <> <Badge tone="bad">inactive</Badge></>}</>;
  const none = <Empty>{t.total ? 'Nothing matches your search or filters.' : 'Nothing here yet.'}</Empty>;
  return (
    <div>
      <PageHead title="Faculties, Departments & Programmes" sub="Academic structure used for registration, approvals and reporting">
        <button className="btn" onClick={() => setEdit({ kind, row: {} })}>+ Add {kind === 'faculties' ? 'faculty' : kind === 'departments' ? 'department' : 'programme'}</button>
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'faculties', label: 'Faculties', count: data.faculties.length }, { key: 'departments', label: 'Departments', count: data.departments.length }, { key: 'programs', label: 'Programmes', count: data.programs.length }]} />
      <div className="card">
        <TableControls {...t} />
        {tab === 'faculties' && (!t.rows.length ? none : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Faculty</th><th>Code</th><th>Dean</th><th>Departments</th><th /></tr></thead>
            <tbody>{t.rows.map((f) => (
              <tr key={f.id} className={f.archived_at ? 'inactive-row' : ''}><td>{nameCell(f)}</td><td>{f.code}</td><td>{f.dean_name || <span className="muted">Not assigned</span>}</td><td>{f.dept_count}</td>
                <td className="nowrap"><button className="btn ghost sm" onClick={() => setHead({ kind: 'faculties', row: f })}>Assign dean</button> <button className="btn ghost sm" onClick={() => setEdit({ kind, row: f })}>Edit</button> {stateBtn(f)}</td></tr>
            ))}</tbody></table></div>
        ))}
        {tab === 'departments' && (!t.rows.length ? none : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Department</th><th>Faculty</th><th>HOD</th><th>Students</th><th>Staff</th><th /></tr></thead>
            <tbody>{t.rows.map((d) => (
              <tr key={d.id} className={d.archived_at ? 'inactive-row' : ''}><td>{nameCell(d)} <small className="muted">{d.code}</small></td><td><small>{d.faculty_name}</small></td><td>{d.hod_name || <span className="muted">Not assigned</span>}</td><td>{d.students}</td><td>{d.staff}</td>
                <td className="nowrap"><button className="btn ghost sm" onClick={() => setHead({ kind: 'departments', row: d })}>Assign HOD</button> <button className="btn ghost sm" onClick={() => setEdit({ kind, row: d })}>Edit</button> {stateBtn(d)}</td></tr>
            ))}</tbody></table></div>
        ))}
        {tab === 'programs' && (!t.rows.length ? none : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Programme</th><th>Degree</th><th>Level</th><th>Department</th><th>Duration</th><th /></tr></thead>
            <tbody>{t.rows.map((p) => (
              <tr key={p.id} className={p.archived_at ? 'inactive-row' : ''}><td>{nameCell(p)}</td><td>{p.degree}</td><td>{p.level === 'PG' ? 'Postgraduate' : 'Undergraduate'}</td><td><small>{p.department_name}</small></td><td>{p.duration}</td>
                <td className="nowrap"><button className="btn ghost sm" onClick={() => setEdit({ kind, row: p })}>Edit</button> {stateBtn(p)}</td></tr>
            ))}</tbody></table></div>
        ))}
        <Pagination {...t} />
      </div>
      {edit && <UnitModal {...edit} data={data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {head && <HeadModal {...head} onClose={() => setHead(null)} onSaved={() => { setHead(null); reload(); }} />}
      {del && <Confirm danger yes="Deactivate" text={`Deactivate ${del.row.name}? It will no longer be offered for registration or new assignments. Existing records are kept and you can reactivate it at any time. A unit that still has active ${del.kind === 'faculties' ? 'departments' : del.kind === 'departments' ? 'programmes or members' : 'students'} cannot be deactivated.`} onClose={() => setDel(null)}
        onYes={async () => { try { await api.post(`/admin/${del.kind}/${del.row.id}/deactivate`); toast(`${del.row.name} deactivated`); reload(); } catch (e) { toastErr(e); } }} />}
    </div>
  );
}

function UnitModal({ kind, row, data, onClose, onSaved }) {
  const [f, setF] = useState({ name: row.name || '', code: row.code || '', faculty_id: row.faculty_id || '', department_id: row.department_id || '', degree: row.degree || '', level: row.level || 'UG', duration: row.duration || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { if (row.id) await api.put(`/admin/${kind}/${row.id}`, f); else await api.post(`/admin/${kind}`, f); toast('Saved'); onSaved(); } catch (e) { toastErr(e); }
  };
  return (
    <Modal title={`${row.id ? 'Edit' : 'Add'} ${kind === 'faculties' ? 'faculty' : kind === 'departments' ? 'department' : 'programme'}`} onClose={onClose}>
      <div className="stack">
        {kind === 'departments' && <Field label="Faculty"><select value={f.faculty_id} onChange={set('faculty_id')}><option value="">Select…</option>{data.faculties.filter((x) => !x.archived_at || x.id === row.faculty_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        {kind === 'programs' && <Field label="Department"><select value={f.department_id} onChange={set('department_id')}><option value="">Select…</option>{data.departments.filter((x) => !x.archived_at || x.id === row.department_id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.faculty_name})</option>)}</select></Field>}
        <Field label="Name"><input value={f.name} onChange={set('name')} placeholder={kind === 'programs' ? 'B.Sc. Computer Science' : ''} /></Field>
        {kind !== 'programs' && <Field label="Code"><input value={f.code} onChange={set('code')} /></Field>}
        {kind === 'programs' && (<div className="grid2">
          <Field label="Degree"><input value={f.degree} onChange={set('degree')} placeholder="B.Sc., M.Sc., PhD…" /></Field>
          <Field label="Level"><select value={f.level} onChange={set('level')}><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select></Field>
          <Field label="Duration"><input value={f.duration} onChange={set('duration')} placeholder="4 years" /></Field>
        </div>)}
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></div>
      </div>
    </Modal>
  );
}

function HeadModal({ kind, row, onClose, onSaved }) {
  const filter = kind === 'faculties' ? `faculty_id=${row.id}` : `department_id=${row.id}`;
  const { data } = useFetch(`/admin/users?role=&${filter}&status=active`);
  const [uid, setUid] = useState('');
  const staff = (data || []).filter((u) => ['lecturer', 'hod', 'dean'].includes(u.role));
  const save = async () => { try { await api.post(`/admin/${kind}/${row.id}/${kind === 'faculties' ? 'dean' : 'hod'}`, { user_id: uid }); toast('Appointment saved'); onSaved(); } catch (e) { toastErr(e); } };
  return (
    <Modal title={`Assign ${kind === 'faculties' ? 'Dean' : 'HOD'} — ${row.name}`} onClose={onClose}>
      {!data ? <Loading /> : !staff.length ? <Empty>No active academic staff in this unit yet.</Empty> : (<div className="stack">
        <p className="muted small">The previous {kind === 'faculties' ? 'dean' : 'HOD'} (if any) reverts to the lecturer role.</p>
        <Field label="Staff member"><select value={uid} onChange={(e) => setUid(e.target.value)}><option value="">Select…</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.title} {u.name} — {u.department_name || u.faculty_name}</option>)}</select></Field>
        <div className="row end"><button className="btn" disabled={!uid} onClick={save}>Appoint</button></div>
      </div>)}
    </Modal>
  );
}
