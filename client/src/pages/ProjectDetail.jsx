import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, Progress, Pagination, TableControls, Tabs, fmtDate, toast, toastErr, timeAgo, useTableControls } from '../components/ui.jsx';
import { CheckReport } from './Studio.jsx';
import Annotator from '../components/Annotator.jsx';

const scoreBand = (v, warn) => (v == null ? 'Not checked' : v >= warn ? 'High' : v >= warn / 2 ? 'Medium' : 'Low');

export function Stepper({ stages, index, substatus }) {
  return (
    <ol className="stepper" aria-label="Project progress">
      {stages.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={s.key} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-dot">{state === 'done' ? '✓' : i + 1}</span>
            <span className="step-label">{s.label}{state === 'current' && substatus ? <small>{substatus}</small> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ProjectView({ id, onLoaded }) {
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);

  const load = async () => {
    try { const d = await api.get(`/projects/${id}`); setP(d); onLoaded?.(d); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!p) return <Loading />;

  const isStudent = p.student_id === user.id;
  const isSup = p.supervisor_id === user.id || p.co_supervisor_id === user.id;
  const isAdm = ['superadmin', 'sysadmin'].includes(user.role);
  const canManage = isAdm || (user.role === 'hod' && p.department_id === user.department_id) || (user.role === 'dean' && p.faculty_id === user.faculty_id);
  const canReview = isSup || canManage;
  const pendingT = p.topics.filter((t) => t.status === 'pending').length;
  const pendingS = p.submissions.filter((s) => s.status === 'submitted').length;
  const update = (d) => { setP(d); onLoaded?.(d); };

  return (
    <div>
      <div className="project-head card">
        <div className="ph-main">
          <div className="row wrap gap"><Badge tone="info">{p.level === 'PG' ? 'Postgraduate' : 'Undergraduate'}</Badge><Badge tone={p.substatus === 'Make corrections' ? 'serious' : p.stage === 'completed' ? 'good' : 'muted'}>{p.substatus}</Badge></div>
          <h2>{p.title || <span className="muted">Title pending topic approval</span>}</h2>
          <div className="meta-grid">
            <div><small>Student</small><strong>{p.student_name}</strong><span className="muted">{p.matric_no}</span></div>
            <div><small>Programme</small><strong>{p.program_name || '—'}</strong><span className="muted">{p.department_name}</span></div>
            <div><small>Supervisor</small><strong>{p.supervisor ? `${p.supervisor.title || ''} ${p.supervisor.name}` : 'Not allocated'}</strong>{p.co_supervisor && <span className="muted">Co: {p.co_supervisor.name}</span>}</div>
            <div><small>Progress</small><Progress value={p.progress} /><span className="muted">{p.stage_label}</span></div>
          </div>
        </div>
        <div className="ph-actions">
          {isStudent && p.supervisor && <Link className="btn ghost" to={`/messages/${p.supervisor.id}`}>Message supervisor</Link>}
          {!isStudent && <Link className="btn ghost" to={`/messages/${p.student_id}`}>Message student</Link>}
          {canManage && <button className="btn ghost" onClick={() => setModal('allocate')}>{p.supervisor ? 'Change supervisor' : 'Allocate supervisor'}</button>}
          {canReview && <button className="btn ghost" onClick={() => setModal('stage')}>Update stage</button>}
          {canManage && <button className="btn ghost" onClick={() => setModal('defense')}>Schedule defense</button>}
        </div>
      </div>

      <div className="card"><Stepper stages={p.stages} index={p.stage_index} substatus={p.substatus} /></div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview' }, { key: 'topics', label: 'Topics', count: pendingT },
        { key: 'submissions', label: 'Submissions', count: pendingS }, { key: 'timeline', label: 'Timeline' }, { key: 'defenses', label: 'Defenses', count: p.defenses.length },
      ]} />

      {tab === 'overview' && <Overview p={p} isStudent={isStudent} canReview={canReview} onChange={update} />}
      {tab === 'topics' && <Topics p={p} isStudent={isStudent} canReview={canReview} onChange={update} />}
      {tab === 'submissions' && <Submissions p={p} isStudent={isStudent} canReview={canReview} onChange={update} />}
      {tab === 'timeline' && (
        <div className="card"><ul className="timeline">
          {p.events.map((e) => <li key={e.id}><strong>{e.label}</strong>{e.note && <p className="muted">{e.note}</p>}<small className="muted">{e.actor || 'System'} · {fmtDate(e.created_at, true)}</small></li>)}
        </ul></div>
      )}
      {tab === 'defenses' && <DefenseList p={p} canManage={canManage} onChange={update} />}

      {modal === 'allocate' && <AllocateModal p={p} onClose={() => setModal(null)} onDone={update} />}
      {modal === 'stage' && <StageModal p={p} onClose={() => setModal(null)} onDone={update} />}
      {modal === 'defense' && <DefenseModal p={p} onClose={() => setModal(null)} onDone={update} />}
    </div>
  );
}

function Overview({ p, isStudent, canReview, onChange }) {
  const [abstract, setAbstract] = useState(p.abstract || '');
  const [editing, setEditing] = useState(false);
  const save = async () => { try { onChange(await api.put(`/projects/${p.id}`, { abstract })); setEditing(false); toast('Abstract saved'); } catch (e) { toastErr(e); } };
  const latest = p.submissions[0];
  return (
    <div className="grid2">
      <div className="card">
        <div className="card-head"><h3>Abstract / Synopsis</h3>{(isStudent || canReview) && !editing && <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}</div>
        {editing ? (<><textarea rows={8} value={abstract} onChange={(e) => setAbstract(e.target.value)} /><div className="row end"><button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button><button className="btn" onClick={save}>Save</button></div></>)
          : <p className="prewrap">{p.abstract || <span className="muted">No abstract yet.</span>}</p>}
      </div>
      <div className="card">
        <h3>At a glance</h3>
        <dl className="dl">
          <dt>Session</dt><dd>{p.session || '—'}</dd>
          <dt>Current stage</dt><dd>{p.stage_label}</dd>
          <dt>Latest submission</dt><dd>{latest ? <>{latest.title} v{latest.version} <Badge>{latest.status}</Badge></> : '—'}</dd>
          <dt>Last activity</dt><dd>{timeAgo(p.last_activity) || '—'}</dd>
          <dt>Next defense</dt><dd>{p.defenses.find((d) => d.status === 'scheduled') ? `${p.defenses.find((d) => d.status === 'scheduled').type} – ${fmtDate(p.defenses.find((d) => d.status === 'scheduled').scheduled_at, true)}` : '—'}</dd>
        </dl>
      </div>
    </div>
  );
}

function Topics({ p, isStudent, canReview, onChange }) {
  const [rows, setRows] = useState([{ title: '', description: '' }]);
  const [review, setReview] = useState(null);
  const approved = p.topics.some((t) => t.status === 'approved');
  const pending = p.topics.filter((t) => t.status === 'pending').length;
  const tc = useTableControls(p.topics, {
    placeholder: 'Search topics, feedback…', search: ['title', 'description', 'refined_title', 'feedback', 'reviewer'],
    filters: [{ key: 'status', label: 'Status', get: (t) => t.status }, { key: 'date', label: 'Submitted', type: 'date', get: (t) => t.created_at }],
  });
  const submit = async () => {
    try { onChange(await api.post(`/projects/${p.id}/topics`, { topics: rows })); setRows([{ title: '', description: '' }]); toast('Topics submitted to your supervisor'); } catch (e) { toastErr(e); }
  };
  return (
    <div className="stack">
      {isStudent && !approved && (
        <div className="card">
          <h3>Propose project topics</h3>
          {!p.supervisor ? <Empty>You can propose topics once your HOD allocates a supervisor.</Empty> : (<>
            <p className="muted">Submit up to three candidate topics. Your supervisor can approve one, refine its wording, or return it for revision.</p>
            {rows.map((r, i) => (
              <div key={i} className="topic-row">
                <Field label={`Topic ${i + 1}`}><input value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="e.g. Design and Implementation of…" /></Field>
                <Field label="Brief description / problem statement"><textarea rows={2} value={r.description} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></Field>
              </div>
            ))}
            <div className="row between">
              <button className="btn ghost" disabled={rows.length + pending >= 3} onClick={() => setRows([...rows, { title: '', description: '' }])}>+ Add another topic</button>
              <button className="btn" onClick={submit}>Submit for approval</button>
            </div>
          </>)}
        </div>
      )}
      <div className="card">
        <h3>Topic history</h3>
        {p.topics.length > 2 && <TableControls {...tc} />}
        {!p.topics.length ? <Empty>No topics submitted yet.</Empty> : tc.rows.map((t) => (
          <div key={t.id} className="list-item">
            <div className="row between wrap"><strong>{t.title}</strong><Badge>{t.status}</Badge></div>
            {t.description && <p className="muted">{t.description}</p>}
            {t.refined_title && t.refined_title !== t.title && <p>Refined title: <strong>{t.refined_title}</strong></p>}
            {t.feedback && <div className="feedback"><small className="muted">Feedback from {t.reviewer}</small><p>{t.feedback}</p></div>}
            <div className="row between"><small className="muted">Submitted {fmtDate(t.created_at)}</small>
              {canReview && t.status === 'pending' && <button className="btn sm" onClick={() => setReview(t)}>Review topic</button>}</div>
          </div>
        ))}
        <Pagination {...tc} />
      </div>
      {review && <TopicReview t={review} onClose={() => setReview(null)} onDone={onChange} />}
    </div>
  );
}

function TopicReview({ t, onClose, onDone }) {
  const [refined, setRefined] = useState(t.title);
  const [feedback, setFeedback] = useState('');
  const act = async (action) => {
    try { onDone(await api.put(`/projects/topics/${t.id}`, { action, refined_title: refined, feedback })); toast(`Topic ${action === 'approve' ? 'approved' : action === 'revise' ? 'returned for refinement' : 'rejected'}`); onClose(); } catch (e) { toastErr(e); }
  };
  return (
    <Modal title="Review topic" onClose={onClose}>
      <p><strong>{t.title}</strong></p>{t.description && <p className="muted">{t.description}</p>}
      <Field label="Approved / refined title" hint="Edit the wording before approving if necessary"><textarea rows={2} value={refined} onChange={(e) => setRefined(e.target.value)} /></Field>
      <Field label="Feedback to student"><textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Comments on scope, feasibility, methodology…" /></Field>
      <div className="row end wrap">
        <button className="btn danger ghost" onClick={() => act('reject')}>Reject</button>
        <button className="btn ghost" onClick={() => act('revise')}>Return for refinement</button>
        <button className="btn" onClick={() => act('approve')}>Approve topic</button>
      </div>
    </Modal>
  );
}

function Submissions({ p, isStudent, canReview, onChange }) {
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const t = useTableControls(p.submissions, {
    placeholder: 'Search submissions, notes, feedback…', search: ['title', 'file_name', 'note', 'feedback', 'reviewer'],
    filters: [
      { key: 'stage', label: 'Stage', get: (s) => s.title },
      { key: 'status', label: 'Status', get: (s) => s.status },
      { key: 'plag', label: 'Similarity', get: (s) => scoreBand(s.plagiarism_score, 25) },
      { key: 'ai', label: 'AI indicator', get: (s) => scoreBand(s.ai_score, 60) },
      { key: 'file', label: 'Attachment', get: (s) => (s.file_name ? 'With file' : 'Editor text only') },
      { key: 'date', label: 'Submitted', type: 'date', get: (s) => s.created_at },
    ],
  });
  return (
    <div className="stack">
      {isStudent && (
        <div className="row end"><button className="btn" disabled={!p.supervisor || p.stage === 'topic' || p.stage === 'registered'} onClick={() => setCreating(true)}>+ New submission</button></div>
      )}
      <div className="card">
        {p.submissions.length > 0 && <TableControls {...t} />}
        {!p.submissions.length ? <Empty>No submissions yet.</Empty> : !t.rows.length ? <Empty>No submissions match your search or filters.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Submission</th><th>Version</th><th>Similarity</th><th>AI indicator</th><th>Status</th><th>Date</th><th /></tr></thead>
            <tbody>{t.rows.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.title}</strong>{s.file_name && <><br /><small className="muted">📎 {s.file_name}</small></>}
                  {(s.open_comments > 0 || s.annotated) && <><br /><small className="annot-flag">{s.open_comments > 0 ? `💬 ${s.open_comments} open comment${s.open_comments === 1 ? '' : 's'}` : '✎ Annotated'}</small></>}</td>
                <td>v{s.version}</td>
                <td>{s.plagiarism_score != null ? <ScorePill v={s.plagiarism_score} warn={25} /> : '—'}</td>
                <td>{s.ai_score != null ? <ScorePill v={s.ai_score} warn={60} /> : '—'}</td>
                <td><Badge>{s.status}</Badge></td>
                <td><small>{fmtDate(s.created_at)}</small></td>
                <td><button className="btn ghost sm" onClick={() => setViewing(s.id)}>{canReview && s.status === 'submitted' ? 'Review' : 'Open'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination {...t} />
      </div>
      {creating && <NewSubmission p={p} onClose={() => setCreating(false)} onDone={onChange} />}
      {viewing && <SubmissionModal id={viewing} canReview={canReview} onClose={() => setViewing(null)} onDone={onChange} />}
    </div>
  );
}

export const ScorePill = ({ v, warn }) => <span className={`score ${v >= warn ? 'high' : v >= warn / 2 ? 'mid' : 'low'}`}>{Math.round(v)}%</span>;

function NewSubmission({ p, onClose, onDone }) {
  const docStages = p.stages.filter((s, i) => s.doc && i <= p.stage_index);
  const [stage, setStage] = useState(p.stages[p.stage_index]?.doc ? p.stage : docStages.at(-1)?.key || '');
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState('');
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/documents').then(setDocs).catch(() => {}); }, []);
  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('stage', stage);
      fd.append('title', p.stages.find((s) => s.key === stage)?.label.split(' –')[0] || 'Submission');
      fd.append('note', note);
      if (docId) fd.append('content_html', (await api.get(`/documents/${docId}`)).content_html);
      if (file) fd.append('file', file);
      onDone(await api.post(`/projects/${p.id}/submissions`, fd));
      toast('Submitted. Your supervisor has been notified.'); onClose();
    } catch (e) { toastErr(e); }
    setBusy(false);
  };
  return (
    <Modal title="New submission" onClose={onClose}>
      {!docStages.length ? <Empty>No document stage is open yet.</Empty> : (<div className="stack">
        <Field label="Stage"><select value={stage} onChange={(e) => setStage(e.target.value)}>{docStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="From Writing Studio document" hint="Content is checked for similarity and AI-writing automatically"><select value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">— none —</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
        <Field label="…and/or attach a file" hint=".docx files are also text-checked automatically (max 25 MB)"><input type="file" accept=".doc,.docx,.pdf,.odt,.rtf,.zip,.pptx,.xlsx" onChange={(e) => setFile(e.target.files[0])} /></Field>
        <Field label="Note to supervisor"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Summarise what changed since the last version" /></Field>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || (!docId && !file)} onClick={submit}>{busy ? 'Submitting…' : 'Submit'}</button></div>
      </div>)}
    </Modal>
  );
}

function SubmissionModal({ id, canReview, onClose, onDone }) {
  const [s, setS] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [report, setReport] = useState(null);
  useEffect(() => { api.get(`/projects/submissions/${id}`).then((d) => { setS(d); setFeedback(d.feedback || ''); }).catch(toastErr); }, [id]);
  const act = async (action) => {
    try { onDone(await api.put(`/projects/submissions/${id}/review`, { action, feedback })); toast(action === 'approve' ? 'Submission approved' : 'Corrections sent to student'); onClose(); } catch (e) { toastErr(e); }
  };
  const runCheck = async (kind) => {
    try { setReport({ kind, data: await api.post(kind === 'plag' ? '/tools/plagiarism' : '/tools/ai-check', { html: s.content_html }) }); } catch (e) { toastErr(e); }
  };
  return (
    <Modal title={s ? `${s.stage_label} — v${s.version}` : 'Submission'} onClose={onClose} wide="x">
      {!s ? <Loading /> : (<div className="stack">
        <div className="row wrap gap">
          <Badge>{s.status}</Badge>
          {s.plagiarism_score != null && <span>Similarity <ScorePill v={s.plagiarism_score} warn={25} /></span>}
          {s.ai_score != null && <span>AI indicator <ScorePill v={s.ai_score} warn={60} /></span>}
          {s.file_name && <a className="btn ghost sm" href={fileUrl(`/projects/submissions/${s.id}/file`)}>📎 Download {s.file_name}</a>}
          {s.content_html && <><button className="btn ghost sm" onClick={() => runCheck('plag')}>Full similarity report</button><button className="btn ghost sm" onClick={() => runCheck('ai')}>Full AI report</button></>}
        </div>
        {s.note && <div className="feedback"><small className="muted">Student's note</small><p>{s.note}</p></div>}
        {report && <CheckReport kind={report.kind} data={report.data} />}
        {s.content_html
          ? <Annotator submission={s} onChange={setS} />
          : <Empty>Content is only in the attached file, so it can't be annotated inline. Ask the student to submit a .docx or editor document.</Empty>}
        {canReview ? (<>
          <Field label="Overall feedback / corrections" hint={s.comments?.some((c) => !c.parent_id && c.status === 'open') ? 'Optional — the student will also see your inline comments.' : 'Summarise the corrections, or add inline comments on the text.'}><textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="List corrections clearly, e.g. 1. Expand 2.3 with recent studies…" /></Field>
          <div className="row end"><button className="btn ghost" onClick={() => act('corrections')}>Request corrections</button><button className="btn" onClick={() => act('approve')}>Approve</button></div>
        </>) : s.feedback && <div className="feedback"><small className="muted">Supervisor feedback</small><p className="prewrap">{s.feedback}</p></div>}
      </div>)}
    </Modal>
  );
}

function AllocateModal({ p, onClose, onDone }) {
  const [list, setList] = useState(null);
  const [sup, setSup] = useState(p.supervisor_id || '');
  const [co, setCo] = useState(p.co_supervisor_id || '');
  useEffect(() => { api.get(`/projects/supervisors?department_id=${p.department_id}`).then(setList).catch(toastErr); }, [p.department_id]);
  const save = async () => { try { onDone(await api.post(`/projects/${p.id}/allocate`, { supervisor_id: sup || null, co_supervisor_id: co || null })); toast('Supervisor allocation saved'); onClose(); } catch (e) { toastErr(e); } };
  return (
    <Modal title={`Allocate supervisor — ${p.student_name}`} onClose={onClose}>
      {!list ? <Loading /> : (<div className="stack">
        <Field label="Supervisor" hint="Sorted by department and current workload"><select value={sup} onChange={(e) => setSup(e.target.value)}><option value="">— none —</option>{list.map((l) => <option key={l.id} value={l.id}>{l.title} {l.name} · {l.load} students{l.department_id !== p.department_id ? ` · ${l.department_name}` : ''}{l.research_interests ? ` · ${l.research_interests}` : ''}</option>)}</select></Field>
        <Field label="Co-supervisor (optional)"><select value={co} onChange={(e) => setCo(e.target.value)}><option value="">— none —</option>{list.filter((l) => String(l.id) !== String(sup)).map((l) => <option key={l.id} value={l.id}>{l.title} {l.name}</option>)}</select></Field>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save allocation</button></div>
      </div>)}
    </Modal>
  );
}

function StageModal({ p, onClose, onDone }) {
  const [stage, setStage] = useState(p.stage);
  const [note, setNote] = useState('');
  const save = async () => { try { onDone(await api.post(`/projects/${p.id}/stage`, { stage, note })); toast('Stage updated'); onClose(); } catch (e) { toastErr(e); } };
  return (
    <Modal title="Update project stage" onClose={onClose}>
      <p className="muted">Use this for non-document milestones such as seminars, defense outcomes or marking the project completed.</p>
      <Field label="Stage"><select value={stage} onChange={(e) => setStage(e.target.value)}>{p.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      <Field label="Note"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Update</button></div>
    </Modal>
  );
}

export const DEFENSE_TYPES = ['Proposal Defense', 'Seminar', 'Post-Field Seminar', 'Internal Defense', 'Final Defense', 'Viva Voce'];
function DefenseModal({ p, onClose, onDone }) {
  const [f, setF] = useState({ type: p.level === 'PG' ? 'Proposal Defense' : 'Final Defense', scheduled_at: '', venue: '', panel: '' });
  const save = async () => { try { onDone(await api.post(`/projects/${p.id}/defenses`, f)); toast('Defense scheduled; student and supervisor notified'); onClose(); } catch (e) { toastErr(e); } };
  return (
    <Modal title={`Schedule defense — ${p.student_name}`} onClose={onClose}>
      <div className="stack">
        <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{DEFENSE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Date & time"><input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></Field>
        <Field label="Venue"><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} placeholder="e.g. Faculty Board Room" /></Field>
        <Field label="Panel members"><textarea rows={2} value={f.panel} onChange={(e) => setF({ ...f, panel: e.target.value })} placeholder="Names of examiners" /></Field>
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Schedule</button></div>
      </div>
    </Modal>
  );
}

function DefenseList({ p, canManage, onChange }) {
  const set = async (d, status) => {
    const remarks = status === 'scheduled' ? undefined : window.prompt(`Remarks for ${status}:`, d.remarks || '') ?? undefined;
    try { onChange(await api.put(`/projects/defenses/${d.id}`, { status, remarks })); } catch (e) { toastErr(e); }
  };
  return (
    <div className="card">
      {!p.defenses.length ? <Empty>No defenses or seminars scheduled.</Empty> : (
        <table className="table"><thead><tr><th>Type</th><th>When</th><th>Venue</th><th>Panel</th><th>Status</th><th>Remarks</th>{canManage && <th />}</tr></thead>
          <tbody>{p.defenses.map((d) => (
            <tr key={d.id}><td>{d.type}</td><td>{fmtDate(d.scheduled_at, true)}</td><td>{d.venue}</td><td><small>{d.panel}</small></td><td><Badge>{d.status}</Badge></td><td><small>{d.remarks}</small></td>
              {canManage && <td className="nowrap">{d.status === 'scheduled' && <><button className="btn sm" onClick={() => set(d, 'passed')}>Passed</button> <button className="btn ghost sm" onClick={() => set(d, 'failed')}>Failed</button> <button className="btn ghost sm" onClick={() => set(d, 'cancelled')}>Cancel</button></>}</td>}
            </tr>
          ))}</tbody></table>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  return <div><button className="back" onClick={() => nav(-1)}>← Back</button><ProjectView id={id} /></div>;
}
