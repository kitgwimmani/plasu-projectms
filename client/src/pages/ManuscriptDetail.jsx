import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Confirm, Field, Loading, Modal, Tabs, timeAgo, toast, toastErr, useFetch } from '../components/ui.jsx';
import { CheckReport } from './Studio.jsx';
import { PIPELINE } from './Manuscripts.jsx';

export default function ManuscriptDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: m, reload, error } = useFetch(`/manuscripts/${id}`);
  const [tab, setTab] = useState('details');
  const [f, setF] = useState(null);
  const [comment, setComment] = useState('');
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(false);
  const [report, setReport] = useState(null);
  const body = useRef(null);
  useEffect(() => { if (m) setF({ title: m.title, abstract: m.abstract || '', keywords: m.keywords || '', target_journal: m.target_journal || '', doi: m.doi || '' }); }, [m]);
  useEffect(() => { if (tab === 'write' && body.current && m) body.current.innerHTML = m.content_html || '<p>Start writing your manuscript here…</p>'; }, [tab, m]);
  if (error) return <p className="error-box">{error}</p>;
  if (!m || !f) return <Loading />;
  const owner = m.owner_id === user.id;

  const save = async (extra = {}) => {
    try { await api.put(`/manuscripts/${id}`, { ...f, ...extra, ...(tab === 'write' && body.current ? { content_html: body.current.innerHTML } : {}) }); toast('Saved'); reload(); } catch (e) { toastErr(e); }
  };
  const upload = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    try { await api.post(`/manuscripts/${id}/file`, fd); toast('File uploaded'); reload(); } catch (e) { toastErr(e); }
  };
  const exportDocx = () => api.download('/tools/export', { html: `<h1>${f.title}</h1><p><b>Abstract:</b> ${f.abstract}</p><p><b>Keywords:</b> ${f.keywords}</p>${body.current?.innerHTML || m.content_html || ''}`, title: f.title, preset: 'journal', includeToc: false }).catch(toastErr);
  const check = async (kind) => {
    const html = `${f.abstract} ${body.current?.innerHTML || m.content_html || ''}`;
    try { setReport({ kind, data: await api.post(kind === 'plag' ? '/tools/plagiarism' : '/tools/ai-check', { html }) }); } catch (e) { toastErr(e); }
  };
  const idx = PIPELINE.findIndex(([k]) => k === m.status);

  return (
    <div>
      <button className="back" onClick={() => nav('/manuscripts')}>← Manuscripts</button>
      {m.archived_at && (
        <div className="archived-banner">
          <span>🗄 This manuscript is archived and read-only.</span>
          {(owner || ['superadmin', 'sysadmin'].includes(user.role)) && <button className="btn sm" onClick={async () => { try { await api.post(`/manuscripts/${id}/restore`); toast('Manuscript restored'); reload(); } catch (e) { toastErr(e); } }}>Restore</button>}
        </div>
      )}
      <div className="card">
        <div className="row between wrap"><h2>{m.title}</h2><Badge>{m.status}</Badge></div>
        <ol className="pipeline">{PIPELINE.map(([k, label], i) => (
          <li key={k} className={i < idx ? 'done' : i === idx ? 'current' : ''}><button onClick={() => save({ status: k })} title={`Move to ${label}`}>{label}</button></li>
        ))}</ol>
        <small className="muted">Click a stage to update status. Co-authors are notified of changes.</small>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'details', label: 'Details' }, { key: 'write', label: 'Manuscript text' }, { key: 'team', label: `Authors (${m.members.length})` }, { key: 'review', label: `Review comments (${m.comments.length})` }]} />
      {tab === 'details' && (
        <div className="card stack">
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Abstract"><textarea rows={6} value={f.abstract} onChange={(e) => setF({ ...f, abstract: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Keywords"><input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field>
            <Field label="Target journal / conference"><input value={f.target_journal} onChange={(e) => setF({ ...f, target_journal: e.target.value })} /></Field>
            <Field label="DOI (after publication)"><input value={f.doi} onChange={(e) => setF({ ...f, doi: e.target.value })} /></Field>
            <Field label="Manuscript file" hint={m.file_name ? `Current: ${m.file_name}` : 'Upload the latest .docx/.pdf'}><input type="file" accept=".doc,.docx,.pdf,.tex,.zip" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} /></Field>
          </div>
          <div className="row between wrap">
            <div className="row gap">{m.file_name && <a className="btn ghost sm" href={fileUrl(`/manuscripts/${id}/file`)}>Download {m.file_name}</a>}
              {owner && !m.archived_at && <button className="btn ghost sm" onClick={() => setDel(true)}>Archive manuscript</button>}</div>
            <button className="btn" onClick={() => save()}>Save details</button>
          </div>
        </div>
      )}
      {tab === 'write' && (
        <div className="card">
          <div className="row between wrap"><small className="muted">Shared draft — all co-authors can edit. Save to keep changes.</small>
            <div className="row gap"><button className="btn ghost sm" onClick={() => check('plag')}>Similarity check</button><button className="btn ghost sm" onClick={() => check('ai')}>AI check</button><button className="btn ghost sm" onClick={exportDocx}>Export .docx (journal format)</button><button className="btn sm" onClick={() => save()}>Save</button></div></div>
          {report && <CheckReport kind={report.kind} data={report.data} />}
          <div ref={body} className="page compact-page" contentEditable suppressContentEditableWarning aria-label="Manuscript text" />
        </div>
      )}
      {tab === 'team' && (
        <div className="card">
          <table className="table"><thead><tr><th>Name</th><th>Role</th><th>Email</th>{owner && <th />}</tr></thead>
            <tbody>{m.members.map((x) => <tr key={x.id}><td>{x.title} {x.name}</td><td>{x.role}</td><td>{x.email}</td>
              {owner && <td>{x.id !== m.owner_id && <button className="btn ghost sm danger" onClick={async () => { await api.del(`/manuscripts/${id}/members/${x.id}`); reload(); }}>Remove</button>}</td>}</tr>)}</tbody></table>
          {owner && <button className="btn ghost" onClick={() => setAdding(true)}>+ Invite co-author / reviewer</button>}
        </div>
      )}
      {tab === 'review' && (
        <div className="card">
          {m.comments.map((c) => <div key={c.id} className="comment"><strong>{c.author}</strong> <small className="muted">{timeAgo(c.created_at)}</small><p className="prewrap">{c.body}</p></div>)}
          <Field label="Add comment / internal review note"><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <div className="row end"><button className="btn" disabled={!comment.trim()} onClick={async () => { try { await api.post(`/manuscripts/${id}/comments`, { body: comment }); setComment(''); reload(); } catch (e) { toastErr(e); } }}>Post comment</button></div>
        </div>
      )}
      {adding && <AddMember id={id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {del && <Confirm yes="Archive" text="Archive this manuscript? It is hidden from all authors' active lists but its text, files, co-authors and comments are kept, and it can be restored." onClose={() => setDel(false)} onYes={async () => { try { await api.post(`/manuscripts/${id}/archive`); toast('Manuscript archived'); reload(); } catch (e) { toastErr(e); } }} />}
    </div>
  );
}

function AddMember({ id, onClose, onDone }) {
  const [s, setS] = useState('');
  const [role, setRole] = useState('co-author');
  const { data } = useFetch(`/messages/contacts?search=${encodeURIComponent(s)}`);
  const add = async (uid) => { try { await api.post(`/manuscripts/${id}/members`, { user_id: uid, role }); toast('Invited'); onDone(); } catch (e) { toastErr(e); } };
  return (
    <Modal title="Invite collaborator" onClose={onClose}>
      <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value)}><option>co-author</option><option>corresponding author</option><option>internal reviewer</option></select></Field>
      <input className="search block" placeholder="Search people…" value={s} onChange={(e) => setS(e.target.value)} />
      <div className="picker">{(data || []).map((u) => <button key={u.id} className="picker-item" onClick={() => add(u.id)}><strong>{u.title} {u.name}</strong><small className="muted">{u.department_name}</small></button>)}</div>
    </Modal>
  );
}
