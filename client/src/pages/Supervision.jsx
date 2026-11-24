import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Loading, PageHead, Pagination, Progress, TableControls, timeAgo, useFetch, useTableControls } from '../components/ui.jsx';

export default function Supervision() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/projects?mine=1');
  const nav = useNavigate();
  const t = useTableControls(data, {
    pageSize: 12,
    placeholder: 'Search student, matric no., title…',
    search: ['student_name', 'matric_no', 'title', 'program_name', 'stage_label', 'substatus'],
    filters: [
      { key: 'level', label: 'Level', get: (p) => p.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
      { key: 'program', label: 'Programme', get: (p) => p.program_name },
      { key: 'stage', label: 'Stage', get: (p) => p.stage_label },
      { key: 'status', label: 'Status', get: (p) => p.substatus },
      { key: 'role', label: 'My role', get: (p) => (p.supervisor_id === user.id ? 'Main supervisor' : 'Co-supervisor') },
      { key: 'review', label: 'Awaiting my review', get: (p) => (p.pending_topics + p.pending_submissions > 0 ? 'Yes' : 'No') },
    ],
  });
  if (loading) return <Loading />;
  return (
    <div>
      <PageHead title="My Students" sub="Students allocated to you for project supervision" />
      {!data?.length ? <Empty>No students allocated to you yet. Your HOD allocates students for supervision.</Empty> : (<>
        <TableControls {...t} />
        {!t.rows.length ? <Empty>No students match your search or filters.</Empty> : (
          <div className="cards">
            {t.rows.map((p) => (
              <div key={p.id} className="card clickable student-card" onClick={() => nav(`/projects/${p.id}`)}>
                <div className="row between"><strong>{p.student_name}</strong><Badge tone="info">{p.level}</Badge></div>
                <small className="muted">{p.matric_no} · {p.program_name}</small>
                <p className="clamp2">{p.title || <span className="muted">Topic not yet approved</span>}</p>
                <Progress value={p.progress} />
                <div className="row between wrap"><small>{p.stage_label}</small>
                  {p.pending_topics + p.pending_submissions > 0 ? <Badge tone="warn">{`${p.pending_topics + p.pending_submissions} awaiting review`}</Badge> : <Badge>{p.substatus}</Badge>}</div>
                <small className="muted">Last activity {timeAgo(p.last_activity)}</small>
              </div>
            ))}
          </div>
        )}
        <Pagination {...t} />
      </>)}
    </div>
  );
}
