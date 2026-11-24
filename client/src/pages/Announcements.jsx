import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, fmtDate, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';

export default function Announcements() {
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, reload } = useFetch(`/announcements${showArchived ? '?archived=1' : ''}`);
  const [open, setOpen] = useState(false);
  const t = useTableControls(data, {
    pageSize: 10, placeholder: 'Search announcements…', search: ['title', 'body', 'author', 'faculty_name', 'department_name'],
    filters: [
      { key: 'audience', label: 'Audience', get: (a) => a.audience, format: (v) => ({ all: 'Everyone', students: 'Students', staff: 'Staff' }[v] || v) },
      { key: 'author', label: 'Posted by', get: (a) => a.author },
      { key: 'unit', label: 'Unit', get: (a) => a.department_name || a.faculty_name, noneLabel: 'University-wide' },
      { key: 'date', label: 'Date', type: 'date', get: (a) => a.created_at },
    ],
  });
  const canPost = ['superadmin', 'sysadmin', 'dean', 'hod'].includes(user.role);
  const setArchived = async (a, restore) => { try { await api.post(`/announcements/${a.id}/${restore ? 'restore' : 'archive'}`); toast(restore ? 'Announcement restored' : 'Announcement archived'); reload(); } catch (e) { toastErr(e); } };
  return (
    <div>
      <PageHead title="Announcements" sub="Notices from the university, faculty and department">{canPost && <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>}{canPost && <button className="btn" onClick={() => setOpen(true)}>+ New announcement</button>}</PageHead>
      <TableControls {...t} />
      {loading ? <Loading /> : !t.rows.length ? <Empty>{t.total ? 'No announcements match your search or filters.' : showArchived ? 'No archived announcements.' : 'No announcements yet.'}</Empty> : t.rows.map((a) => (
        <article key={a.id} className="card announcement">
          <div className="row between wrap"><h3>{a.title}</h3>{(a.created_by === user.id || ['superadmin', 'sysadmin'].includes(user.role)) && (a.archived_at ? <button className="btn sm" onClick={() => setArchived(a, true)}>Restore</button> : <button className="btn ghost sm" onClick={() => setArchived(a, false)}>Archive</button>)}</div>
          <p className="prewrap">{a.body}</p>
          <small className="muted">{a.author} · {fmtDate(a.created_at, true)} · To: {a.audience === 'all' ? 'everyone' : a.audience}{a.department_name ? ` in ${a.department_name}` : a.faculty_name ? ` in ${a.faculty_name}` : ''}</small>
        </article>
      ))}
      <Pagination {...t} />
      {open && <NewAnnouncement onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
    </div>
  );
}

function NewAnnouncement({ onClose, onDone }) {
  const { user } = useAuth();
  const [f, setF] = useState({ title: '', body: '', audience: 'all' });
  const save = async () => { try { await api.post('/announcements', f); toast('Announcement posted and recipients notified'); onDone(); } catch (e) { toastErr(e); } };
  return (
    <Modal title="New announcement" onClose={onClose}>
      <div className="stack">
        <p className="muted small">Visible to {user.role === 'hod' ? `members of ${user.department_name}` : user.role === 'dean' ? `members of ${user.faculty_name}` : 'the whole university'}.</p>
        <Field label="Audience"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="students">Students only</option><option value="staff">Academic staff only</option></select></Field>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Post</button></div>
      </div>
    </Modal>
  );
}
