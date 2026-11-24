import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Loading, PageHead, Pagination, Progress, TableControls, timeAgo, toast, toastErr, useFetch, useTableControls } from '../components/ui.jsx';

export default function Projects() {
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const { data, loading, reload } = useFetch('/projects');
  const { data: structure } = useFetch('/admin/structure');
  const nav = useNavigate();
  const isAdm = ['superadmin', 'sysadmin'].includes(user.role);

  const t = useTableControls(data, {
    placeholder: 'Search student, matric no., title, supervisor…',
    search: ['student_name', 'matric_no', 'student_email', 'title', 'supervisor_name', 'co_supervisor_name', 'program_name', 'department_name', 'stage_label', 'substatus'],
    filters: [
      ...(user.role !== 'hod' ? [{ key: 'dept', label: 'Department', get: (p) => p.department_name }] : []),
      ...(isAdm ? [{ key: 'faculty', label: 'Faculty', get: (p) => p.faculty_name }] : []),
      { key: 'program', label: 'Programme', get: (p) => p.program_name },
      { key: 'level', label: 'Level', get: (p) => p.level, format: (v) => (v === 'PG' ? 'Postgraduate' : 'Undergraduate') },
      { key: 'stage', label: 'Stage', get: (p) => p.stage_label },
      { key: 'status', label: 'Status', get: (p) => p.substatus },
      { key: 'supervisor', label: 'Supervisor', get: (p) => p.supervisor_name, noneLabel: '— Unallocated —' },
      { key: 'review', label: 'Awaiting review', get: (p) => (p.pending_topics + p.pending_submissions > 0 ? 'Yes' : 'No') },
      { key: 'activity', label: 'Last activity', type: 'date', get: (p) => p.last_activity },
    ],
    initial: sp.get('unallocated') === '1' ? { supervisor: '__none' } : {},
  });

  // Admins auto-allocate for the department currently selected in the Department filter.
  const deptId = user.role === 'hod' ? user.department_id : structure?.departments.find((d) => d.name === t.values.dept)?.id;
  const auto = async () => {
    try {
      const r = await api.post('/projects/auto-allocate', { department_id: deptId });
      toast(`${r.allocated} student(s) allocated${r.remaining ? `, ${r.remaining} remaining` : ''}`); reload();
    } catch (e) { toastErr(e); }
  };
  return (
    <div>
      <PageHead title={user.role === 'hod' ? 'Department Projects' : user.role === 'dean' ? 'Faculty Projects' : 'All Projects'} sub="Monitor progress and allocate supervisors">
        {(user.role === 'hod' || (isAdm && deptId)) && <button className="btn" onClick={auto} title="Distribute unallocated students across lecturers by workload and research interests">⚡ Auto-allocate supervisors</button>}
      </PageHead>
      <div className="card">
        <TableControls {...t} />
        {loading ? <Loading /> : !t.rows.length ? <Empty>{t.total ? 'No projects match your search or filters.' : 'No projects yet.'}</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Student</th><th>Project title</th><th>Supervisor</th><th>Stage</th><th>Progress</th><th>Last activity</th></tr></thead>
            <tbody>{t.rows.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => nav(`/projects/${p.id}`)}>
                <td><strong>{p.student_name}</strong><br /><small className="muted">{p.matric_no} · {p.level}{user.role !== 'hod' ? ` · ${p.department_name}` : ''}</small></td>
                <td className="clamp-cell">{p.title || <span className="muted">—</span>}</td>
                <td>{p.supervisor_name ? <>{`${p.supervisor_title || ''} ${p.supervisor_name}`}{p.supervisor_status !== 'active' && <> <Badge tone="bad">inactive</Badge></>}</> : <Badge tone="warn">Unallocated</Badge>}</td>
                <td>{p.stage_label}<br /><small className={p.substatus === 'Make corrections' ? 'text-serious' : 'muted'}>{p.substatus}</small></td>
                <td style={{ minWidth: 120 }}><Progress value={p.progress} /></td>
                <td><small>{timeAgo(p.last_activity)}</small></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pagination {...t} />
      </div>
    </div>
  );
}
