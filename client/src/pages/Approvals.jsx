import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, fmtDate, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';
import { ROLE_LABEL } from '../auth.jsx';

export default function Approvals() {
  const { data, loading, reload } = useFetch('/admin/approvals');
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState('');
  const t = useTableControls(data, {
    placeholder: 'Search name, email, matric/staff ID, phone…',
    search: ['name', 'email', 'phone', 'matric_no', 'staff_id', 'department_name', 'program_name', 'research_interests'],
    filters: [
      { key: 'role', label: 'Role', get: (u) => u.role, format: (v) => ROLE_LABEL[v] || v },
      { key: 'dept', label: 'Department', get: (u) => u.department_name },
      { key: 'program', label: 'Programme', get: (u) => u.program_name, noneLabel: '— Staff —' },
      { key: 'level', label: 'Level', get: (u) => u.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate'), noneLabel: '— Staff —' },
      { key: 'requested', label: 'Requested', type: 'date', get: (u) => u.created_at },
    ],
  });
  const act = async (u, action, why) => {
    try {
      await api.post(`/admin/approvals/${u.id}`, { action, reason: why });
      toast(`${u.name} ${action === 'approve' ? 'approved' : 'rejected'}`); reload();
      window.dispatchEvent(new Event('counts:refresh'));
    } catch (e) { toastErr(e); }
  };
  if (loading || !data) return <Loading />;
  return (
    <div>
      <PageHead title="Registration Approvals" sub="Verify students and staff requesting to join your department" />
      <div className="card">
        {data.length > 0 && <TableControls {...t} />}
        {!data.length ? <Empty>No pending registration requests.</Empty> : !t.rows.length ? <Empty>No requests match your search or filters.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>ID number</th><th>Department / Programme</th><th>Requested</th><th /></tr></thead>
            <tbody>{t.rows.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.title} {u.name}</strong><br /><small className="muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</small></td>
                <td><Badge tone="info">{ROLE_LABEL[u.role]}</Badge>{u.level && <> <Badge>{u.level}</Badge></>}</td>
                <td>{u.matric_no || u.staff_id}</td>
                <td>{u.department_name}<br /><small className="muted">{u.program_name || u.research_interests}</small></td>
                <td>{fmtDate(u.created_at)}</td>
                <td className="nowrap"><button className="btn sm" onClick={() => act(u, 'approve')}>Approve</button> <button className="btn sm ghost danger" onClick={() => { setReject(u); setReason(''); }}>Reject</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pagination {...t} />
      </div>
      {reject && (
        <Modal title={`Reject ${reject.name}`} onClose={() => setReject(null)}>
          <Field label="Reason (sent to the applicant)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Matric number could not be verified" /></Field>
          <div className="row end"><button className="btn danger" onClick={() => { act(reject, 'reject', reason); setReject(null); }}>Reject request</button></div>
        </Modal>
      )}
    </div>
  );
}
