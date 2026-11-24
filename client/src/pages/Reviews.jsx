import { Link } from 'react-router-dom';
import { Empty, Loading, PageHead, Pagination, TableControls, fmtDate, useFetch, useTableControls } from '../components/ui.jsx';
import { ScorePill } from './ProjectDetail.jsx';

export const scoreBand = (v, warn) => (v == null ? 'Not checked' : v >= warn ? 'High' : v >= warn / 2 ? 'Medium' : 'Low');

export default function Reviews() {
  const { data, loading } = useFetch('/projects/reviews/pending');
  const topics = useTableControls(data?.topics, {
    placeholder: 'Search student or topic…', search: ['student_name', 'title', 'description'],
    filters: [{ key: 'student', label: 'Student', get: (t) => t.student_name }, { key: 'date', label: 'Submitted', type: 'date', get: (t) => t.created_at }],
  });
  const subs = useTableControls(data?.submissions, {
    placeholder: 'Search student or stage…', search: ['student_name', 'stage_label', 'title'],
    filters: [
      { key: 'student', label: 'Student', get: (s) => s.student_name },
      { key: 'stage', label: 'Stage', get: (s) => s.stage_label },
      { key: 'level', label: 'Level', get: (s) => s.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
      { key: 'plag', label: 'Similarity', get: (s) => scoreBand(s.plagiarism_score, 25) },
      { key: 'ai', label: 'AI indicator', get: (s) => scoreBand(s.ai_score, 60) },
      { key: 'date', label: 'Submitted', type: 'date', get: (s) => s.created_at },
    ],
  });
  if (loading || !data) return <Loading />;
  return (
    <div>
      <PageHead title="Review Queue" sub="Topics and chapter submissions waiting for your feedback, oldest first" />
      <div className="card">
        <h3>Topic proposals ({data.topics.length})</h3>
        {!data.topics.length ? <Empty>No topics awaiting review 🎉</Empty> : (<>
          <TableControls {...topics} />
          <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Proposed topic</th><th>Submitted</th><th /></tr></thead>
            <tbody>{topics.rows.map((t) => <tr key={t.id}><td>{t.student_name}</td><td>{t.title}</td><td>{fmtDate(t.created_at)}</td><td><Link className="btn sm" to={`/projects/${t.project_id}`}>Review</Link></td></tr>)}</tbody></table></div>
          <Pagination {...topics} />
        </>)}
      </div>
      <div className="card">
        <h3>Submissions ({data.submissions.length})</h3>
        {!data.submissions.length ? <Empty>No submissions awaiting review 🎉</Empty> : (<>
          <TableControls {...subs} />
          <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Stage</th><th>Version</th><th>Similarity</th><th>AI indicator</th><th>Submitted</th><th /></tr></thead>
            <tbody>{subs.rows.map((s) => (
              <tr key={s.id}><td>{s.student_name}</td><td>{s.stage_label}</td><td>v{s.version}</td>
                <td>{s.plagiarism_score != null ? <ScorePill v={s.plagiarism_score} warn={25} /> : '—'}</td><td>{s.ai_score != null ? <ScorePill v={s.ai_score} warn={60} /> : '—'}</td>
                <td>{fmtDate(s.created_at)}</td><td><Link className="btn sm" to={`/projects/${s.project_id}`}>Open</Link></td></tr>
            ))}</tbody></table></div>
          <Pagination {...subs} />
        </>)}
      </div>
    </div>
  );
}
