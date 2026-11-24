import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Field, Loading, Modal, PageHead, TableControls, timeAgo, toastErr, useFetch, useTableControls } from '../components/ui.jsx';

export const PIPELINE = [
  ['drafting', 'Drafting'], ['internal_review', 'Internal review'], ['ready', 'Ready to submit'], ['submitted', 'Submitted'],
  ['under_review', 'Under peer review'], ['revision', 'Revision requested'], ['accepted', 'Accepted'], ['published', 'Published'],
];

export default function Manuscripts() {
  const { feature } = useAuth();
  const { data, loading } = useFetch('/manuscripts');
  const { data: archived } = useFetch('/manuscripts?archived=1');
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const t = useTableControls(data, {
    placeholder: 'Search title, authors, journal…', search: ['title', 'authors', 'target_journal', 'owner_name'],
    filters: [
      { key: 'journal', label: 'Target journal', get: (m) => m.target_journal, noneLabel: '— Not set —' },
      { key: 'lead', label: 'Lead author', get: (m) => m.owner_name },
      { key: 'mine', label: 'My role', get: (m) => (m.owner_id === user.id ? 'Lead author' : 'Collaborator') },
      { key: 'updated', label: 'Updated', type: 'date', get: (m) => m.updated_at },
    ],
  });
  const board = t.allRows; // the board shows every match; it is not paginated
  if (!feature('manuscripts')) return <Empty>Manuscript support is currently disabled.</Empty>;
  return (
    <div>
      <PageHead title="Manuscript Support" sub="Turn projects and theses into publications: co-author, get internal review and track journal submission">
        <button className="btn" onClick={() => setCreating(true)}>+ New manuscript</button>
      </PageHead>
      {loading ? <Loading /> : !data?.length ? (
        <div className="card"><Empty>No manuscripts yet. Start one from your project findings and invite your supervisor as co-author.</Empty>
          <ul className="checklist small">
            <li>Choose a target journal early and follow its author guidelines.</li>
            <li>Use the Writing Studio "Journal article" template and the Journal manuscript export preset.</li>
            <li>Ask a colleague for internal review before submission.</li>
            <li>Beware of predatory journals — verify indexing (e.g. Scopus, Web of Science, DOAJ) before submitting.</li>
          </ul>
        </div>
      ) : (<>
        <TableControls {...t} />
        <div className="kanban">
          {PIPELINE.map(([k, label]) => {
            const items = board.filter((m) => m.status === k);
            return (
              <div key={k} className="kanban-col">
                <div className="kanban-head">{label} <span className="count">{items.length}</span></div>
                {items.map((m) => (
                  <div key={m.id} className="kanban-card" onClick={() => nav(`/manuscripts/${m.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/manuscripts/${m.id}`)}>
                    <strong>{m.title}</strong>
                    <small className="muted">{m.authors}</small>
                    {m.target_journal && <small>🎯 {m.target_journal}</small>}
                    <small className="muted">Updated {timeAgo(m.updated_at)}</small>
                  </div>
                ))}
              </div>
            );
          })}
          {board.some((m) => m.status === 'rejected') && (
            <div className="kanban-col"><div className="kanban-head">Rejected</div>
              {board.filter((m) => m.status === 'rejected').map((m) => <div key={m.id} className="kanban-card" onClick={() => nav(`/manuscripts/${m.id}`)}><strong>{m.title}</strong><Badge>rejected</Badge></div>)}
            </div>
          )}
        </div>
      </>)}
      {archived?.length > 0 && (
        <details className="card">
          <summary>Archived manuscripts ({archived.length})</summary>
          {archived.map((m) => <div key={m.id} className="list-item row between wrap"><span><strong>{m.title}</strong><br /><small className="muted">{m.authors}</small></span><button className="btn ghost sm" onClick={() => nav(`/manuscripts/${m.id}`)}>Open</button></div>)}
        </details>
      )}
      {creating && <NewManuscript onClose={() => setCreating(false)} onDone={(id) => nav(`/manuscripts/${id}`)} />}
    </div>
  );
}

function NewManuscript({ onClose, onDone }) {
  const [f, setF] = useState({ title: '', abstract: '', keywords: '', target_journal: '' });
  const save = async () => { try { onDone((await api.post('/manuscripts', f)).id); } catch (e) { toastErr(e); } };
  return (
    <Modal title="New manuscript" onClose={onClose}>
      <div className="stack">
        <Field label="Working title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Abstract"><textarea rows={5} value={f.abstract} onChange={(e) => setF({ ...f, abstract: e.target.value })} /></Field>
        <Field label="Keywords"><input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="separate; with; semicolons" /></Field>
        <Field label="Target journal / conference"><input value={f.target_journal} onChange={(e) => setF({ ...f, target_journal: e.target.value })} /></Field>
        <div className="row end"><button className="btn" onClick={save}>Create</button></div>
      </div>
    </Modal>
  );
}
