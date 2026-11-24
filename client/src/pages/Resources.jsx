import { useState } from 'react';
import { api, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Confirm, Empty, Field, Loading, Modal, PageHead, Pagination, TableControls, Tabs, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';

const KINDS = [
  { key: 'template', label: 'Templates' }, { key: 'guideline', label: 'Guidelines' }, { key: 'referencing', label: 'Referencing' }, { key: 'other', label: 'Other' },
];

export default function Resources() {
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, reload } = useFetch(`/resources${showArchived ? '?archived=1' : ''}`);
  const [tab, setTab] = useState('template');
  const [adding, setAdding] = useState(false);
  const [arch, setArch] = useState(null);
  const canPublish = ['superadmin', 'sysadmin', 'dean', 'hod'].includes(user.role);
  const t = useTableControls((data || []).filter((r) => r.kind === tab && (user.role !== 'student' || r.level === 'ALL' || r.level === user.level)), {
    placeholder: 'Search title, description…',
    pageSize: 12,
    search: ['title', 'description', 'file_name', 'url', 'uploaded_by_name', 'faculty_name'],
    filters: [
      { key: 'level', label: 'Audience', get: (r) => r.level, format: (v) => ({ ALL: 'All students', UG: 'Undergraduate', PG: 'Postgraduate' }[v] || v) },
      { key: 'format', label: 'Format', get: (r) => (r.url ? 'Web link' : (r.file_name || '').split('.').pop().toUpperCase() || 'File') },
      { key: 'faculty', label: 'Faculty', get: (r) => r.faculty_name, noneLabel: 'University-wide' },
      { key: 'by', label: 'Published by', get: (r) => r.uploaded_by_name },
    ],
  });
  const rows = t.rows;
  return (
    <div>
      <PageHead title="Templates, Guidelines & Referencing" sub="Download official .docx templates and writing guides; learn how to reference correctly">
        {canPublish && <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>}
        {canPublish && <button className="btn" onClick={() => setAdding(true)}>+ Publish resource</button>}
      </PageHead>
      <Tabs tabs={KINDS.map((k) => ({ ...k, count: (data || []).filter((r) => r.kind === k.key).length }))} value={tab} onChange={setTab} />
      <TableControls {...t} />
      {loading ? <Loading /> : !rows.length ? <Empty>{t.total ? 'No resources match your search or filters.' : 'No resources in this category yet.'}</Empty> : (
        <div className="cards">
          {rows.map((r) => (
            <div key={r.id} className="card resource">
              <div className="res-icon" aria-hidden="true">{r.url ? '🔗' : /\.pdf$/i.test(r.file_name || '') ? '📕' : '📄'}</div>
              <div className="res-body">
                <strong>{r.title}</strong>
                {r.description && <p className="muted small">{r.description}</p>}
                <small className="muted">{r.level !== 'ALL' ? `${r.level === 'PG' ? 'Postgraduate' : 'Undergraduate'} · ` : ''}{r.faculty_name ? `${r.faculty_name} · ` : ''}{r.file_path ? `${r.downloads} downloads` : new URL(r.url).hostname}</small>
                <div className="row gap">
                  {r.file_path && <a className="btn sm" href={fileUrl(`/resources/${r.id}/download`)}>Download {(r.file_name || '').split('.').pop().toUpperCase()}</a>}
                  {r.url && <a className="btn sm" href={r.url} target="_blank" rel="noreferrer noopener">Open link ↗</a>}
                  {(['superadmin', 'sysadmin'].includes(user.role) || r.uploaded_by === user.id) && (r.archived_at
                    ? <button className="btn sm" onClick={async () => { try { await api.post(`/resources/${r.id}/restore`); toast('Resource restored'); reload(); } catch (e) { toastErr(e); } }}>Restore</button>
                    : <button className="btn ghost sm" onClick={() => setArch(r)}>Archive</button>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination {...t} />
      {adding && <AddResource kind={tab} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {arch && <Confirm yes="Archive" text={`Archive "${arch.title}"? Students will no longer see it, but the file is kept and it can be restored from the Archived view.`} onClose={() => setArch(null)} onYes={async () => { try { await api.post(`/resources/${arch.id}/archive`); toast('Resource archived'); reload(); } catch (e) { toastErr(e); } }} />}
    </div>
  );
}

function AddResource({ kind, onClose, onDone }) {
  const [f, setF] = useState({ kind, title: '', description: '', url: '', level: 'ALL' });
  const [file, setFile] = useState(null);
  const save = async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('file', file);
    try { await api.post('/resources', fd); toast('Resource published'); onDone(); } catch (e) { toastErr(e); }
  };
  return (
    <Modal title="Publish resource" onClose={onClose}>
      <div className="stack">
        <div className="grid2">
          <Field label="Category"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
          <Field label="Audience"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="ALL">All students</option><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select></Field>
        </div>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="File (.docx, .pdf, .pptx…)"><input type="file" accept=".doc,.docx,.pdf,.ppt,.pptx,.xlsx,.zip" onChange={(e) => setFile(e.target.files[0])} /></Field>
        <Field label="…or external link" hint="e.g. a referencing tutorial or PDF guide"><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" /></Field>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Publish</button></div>
      </div>
    </Modal>
  );
}
