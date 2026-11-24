import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Loading, PageHead, Pagination, TableControls, Tabs, fmtDate, parseDate, useFetch, useTableControls } from '../components/ui.jsx';

export default function Defenses() {
  const { data, loading } = useFetch('/projects/defenses/list');
  const [tab, setTab] = useState('upcoming');
  const now = Date.now();
  const inTab = (d) => (tab === 'upcoming' ? d.status === 'scheduled' && parseDate(d.scheduled_at) >= now - 864e5
    : tab === 'past' ? d.status !== 'scheduled' || parseDate(d.scheduled_at) < now - 864e5 : true);
  const t = useTableControls((data || []).filter(inTab), {
    placeholder: 'Search student, matric no., project, venue, panel…',
    search: ['student_name', 'matric_no', 'project_title', 'venue', 'panel', 'type', 'remarks', 'department_name'],
    filters: [
      { key: 'type', label: 'Type', get: (d) => d.type },
      { key: 'status', label: 'Status', get: (d) => d.status },
      { key: 'dept', label: 'Department', get: (d) => d.department_name },
      { key: 'level', label: 'Level', get: (d) => d.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
      { key: 'venue', label: 'Venue', get: (d) => d.venue, noneLabel: '— TBA —' },
      { key: 'date', label: 'Date', type: 'date', get: (d) => d.scheduled_at },
    ],
  });
  if (loading || !data) return <Loading />;
  return (
    <div>
      <PageHead title="Defenses & Seminars" sub="Schedule from a student's project page (Schedule defense)"><button className="btn ghost" onClick={() => window.print()}>🖨 Print schedule</button></PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past & concluded' }, { key: 'all', label: 'All' }]} />
      <div className="card">
        <TableControls {...t} />
        {!t.rows.length ? <Empty>{t.total ? 'Nothing matches your search or filters.' : 'Nothing here.'}</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Type</th><th>Student</th><th>Project</th><th>Venue</th><th>Panel</th><th>Status</th></tr></thead>
            <tbody>{t.rows.map((d) => (
              <tr key={d.id}><td className="nowrap">{fmtDate(d.scheduled_at, true)}</td><td>{d.type}</td>
                <td><Link to={`/projects/${d.project_id}`}>{d.student_name}</Link><br /><small className="muted">{d.matric_no} · {d.department_name}</small></td>
                <td><small>{d.project_title}</small></td><td>{d.venue}</td><td><small>{d.panel}</small></td><td><Badge>{d.status}</Badge></td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination {...t} />
      </div>
    </div>
  );
}
